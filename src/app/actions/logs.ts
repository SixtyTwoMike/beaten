"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { ensureGame } from "@/lib/games";
import { requireUserId } from "@/lib/session";
import {
  MAX_REVIEW,
  MAX_SHELF_NAME,
  MAX_SHELVES_PER_LOG,
  isIgdbId,
} from "@/lib/limits";
import { isFinishedStatus, isPlayStatus } from "@/lib/status";

export type SaveLogInput = {
  logId?: string;
  igdbId: number;
  status: string;
  platformId?: number | null;
  startedAt?: string | null; // YYYY-MM-DD
  finishedAt?: string | null; // YYYY-MM-DD; null while status is PLAYING
  finishedDateUnknown?: boolean; // finished, but they don't remember when
  isReplay: boolean;
  rating?: number | null; // 1-10 half-star steps
  reviewText?: string | null;
  shelfIds?: string[];
  newShelfName?: string | null;
};

export type ActionResult = { ok: true } | { ok: false; error: string };

// Strictly YYYY-MM-DD; rejects expanded years ("+202600-01-01") and
// rollovers like 2026-02-31.
function parseDate(value: string | null | undefined): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

export async function saveLog(input: SaveLogInput): Promise<ActionResult> {
  try {
    const userId = await requireUserId();

    if (!isIgdbId(input.igdbId)) return { ok: false, error: "Invalid game" };
    if (!isPlayStatus(input.status)) {
      return { ok: false, error: "Invalid status" };
    }
    const dateUnknown = isFinishedStatus(input.status) && input.finishedDateUnknown === true;
    // Without a finish date a start date means little; drop it.
    const startedAt = dateUnknown ? null : parseDate(input.startedAt);
    // Finished statuses need a finish date unless it's unknown; a game still
    // being played has none.
    let finishedAt: Date | null = null;
    if (isFinishedStatus(input.status) && !dateUnknown) {
      finishedAt = parseDate(input.finishedAt);
      if (!finishedAt) return { ok: false, error: "A finish date is required" };
      if (startedAt && startedAt > finishedAt) {
        return { ok: false, error: "Start date must be before the finish date" };
      }
    }
    let rating: number | null = null;
    if (input.rating != null && input.rating !== 0) {
      rating = Math.round(input.rating);
      if (!Number.isFinite(rating) || rating < 1 || rating > 10) {
        return { ok: false, error: "Invalid rating" };
      }
    }
    const reviewText = input.reviewText?.trim() || null;
    if (reviewText && reviewText.length > MAX_REVIEW) {
      return { ok: false, error: `Reviews must be ${MAX_REVIEW} characters or fewer` };
    }
    const newShelfName = input.newShelfName?.trim();
    if (newShelfName && newShelfName.length > MAX_SHELF_NAME) {
      return { ok: false, error: `Shelf name must be ${MAX_SHELF_NAME} characters or fewer` };
    }
    if ((input.shelfIds?.length ?? 0) > MAX_SHELVES_PER_LOG) {
      return { ok: false, error: "Too many shelves" };
    }
    const platformId = input.platformId ?? null;
    if (platformId !== null && !isIgdbId(platformId)) {
      return { ok: false, error: "Invalid platform" };
    }

    const game = await ensureGame(input.igdbId);

    const data = {
      status: input.status,
      platformId,
      startedAt,
      finishedAt,
      isReplay: Boolean(input.isReplay),
      rating,
      reviewText,
    };

    if (input.logId) {
      const existing = await prisma.playLog.findUnique({
        where: { id: input.logId },
      });
      if (!existing || existing.userId !== userId) {
        return { ok: false, error: "Log entry not found" };
      }
      await prisma.playLog.update({ where: { id: input.logId }, data });
    } else {
      await prisma.playLog.create({
        data: { ...data, userId, gameId: game.id },
      });
    }

    // Optional shelf additions
    const shelfIds = [...(input.shelfIds ?? [])];
    if (newShelfName) {
      const shelf = await prisma.shelf.upsert({
        where: { userId_name: { userId, name: newShelfName } },
        update: {},
        create: { userId, name: newShelfName },
      });
      shelfIds.push(shelf.id);
    }
    for (const shelfId of shelfIds) {
      const shelf = await prisma.shelf.findUnique({ where: { id: shelfId } });
      if (!shelf || shelf.userId !== userId) continue;
      await prisma.shelfItem.upsert({
        where: { shelfId_gameId: { shelfId, gameId: game.id } },
        update: {},
        create: { shelfId, gameId: game.id },
      });
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("saveLog failed:", e);
    return { ok: false, error: "Something went wrong saving your log" };
  }
}

export async function deleteLog(logId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const existing = await prisma.playLog.findUnique({ where: { id: logId } });
    if (!existing || existing.userId !== userId) {
      return { ok: false, error: "Log entry not found" };
    }
    await prisma.playLog.delete({ where: { id: logId } });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("deleteLog failed:", e);
    return { ok: false, error: "Something went wrong deleting the log" };
  }
}
