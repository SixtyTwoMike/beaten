"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { ensureGame } from "@/lib/games";
import { requireUserId } from "@/lib/session";
import { isFinishedStatus, isPlayStatus } from "@/lib/status";

export type SaveLogInput = {
  logId?: string;
  igdbId: number;
  status: string;
  platformId?: number | null;
  startedAt?: string | null; // YYYY-MM-DD
  finishedAt?: string | null; // YYYY-MM-DD; null while status is PLAYING
  isReplay: boolean;
  rating?: number | null; // 1-10 half-star steps
  reviewText?: string | null;
  shelfIds?: string[];
  newShelfName?: string | null;
};

export type ActionResult = { ok: true } | { ok: false; error: string };

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

export async function saveLog(input: SaveLogInput): Promise<ActionResult> {
  try {
    const userId = await requireUserId();

    if (!isPlayStatus(input.status)) {
      return { ok: false, error: "Invalid status" };
    }
    const startedAt = parseDate(input.startedAt);
    // Finished statuses require a finish date; a game still being played has none.
    let finishedAt: Date | null = null;
    if (isFinishedStatus(input.status)) {
      finishedAt = parseDate(input.finishedAt);
      if (!finishedAt) return { ok: false, error: "A finish date is required" };
      if (startedAt && startedAt > finishedAt) {
        return { ok: false, error: "Start date must be before the finish date" };
      }
    }
    let rating: number | null = null;
    if (input.rating != null && input.rating !== 0) {
      rating = Math.round(input.rating);
      if (rating < 1 || rating > 10) {
        return { ok: false, error: "Invalid rating" };
      }
    }
    const reviewText = input.reviewText?.trim() || null;
    const platformId = input.platformId ?? null;

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
    const newShelfName = input.newShelfName?.trim();
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
