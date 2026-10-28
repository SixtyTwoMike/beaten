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
import { recordLogActivity } from "@/lib/activity";
import { parsePartialDate, periodEnd } from "@/lib/dates";
import type { DatePrecision } from "@/lib/format";
import { isFinishedStatus, isPlayStatus } from "@/lib/status";

export type SaveLogInput = {
  logId?: string;
  igdbId: number;
  status: string;
  platformId?: number | null;
  startedAt?: string | null; // YYYY-MM-DD, or YYYY-MM / YYYY when that's all they remember
  finishedAt?: string | null; // YYYY-MM-DD / YYYY-MM / YYYY; null unless finished
  finishedDateUnknown?: boolean; // finished, but they don't remember when
  stoppedAt?: string | null; // YYYY-MM-DD / YYYY-MM / YYYY; SHELVED only, optional
  notReturning?: boolean; // SHELVED only
  isReplay: boolean;
  rating?: number | null; // 1-10 half-star steps
  reviewText?: string | null;
  containsSpoilers?: boolean;
  shelfIds?: string[];
  newShelfName?: string | null;
};

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveLog(input: SaveLogInput): Promise<ActionResult> {
  try {
    const userId = await requireUserId();

    if (!isIgdbId(input.igdbId)) return { ok: false, error: "Invalid game" };
    if (!isPlayStatus(input.status)) {
      return { ok: false, error: "Invalid status" };
    }
    const dateUnknown = isFinishedStatus(input.status) && input.finishedDateUnknown === true;
    // Without a finish date a start date means little; drop it.
    const started = dateUnknown ? null : parsePartialDate(input.startedAt);
    if (!dateUnknown && input.startedAt && !started) return { ok: false, error: "Invalid start date" };
    const startedAt = started?.date ?? null;
    // Finished statuses need a finish date unless it's unknown; a game still
    // being played has none.
    let finished: { date: Date; precision: DatePrecision } | null = null;
    if (isFinishedStatus(input.status) && !dateUnknown) {
      finished = parsePartialDate(input.finishedAt);
      if (!finished) return { ok: false, error: "A finish date is required" };
      if (startedAt && startedAt > periodEnd(finished)) {
        return { ok: false, error: "Start date must be before the finish date" };
      }
    }
    const finishedAt = finished?.date ?? null;
    // Shelved: when it was put down (optional), and whether for good.
    const shelved = input.status === "SHELVED";
    const stopped = shelved ? parsePartialDate(input.stoppedAt) : null;
    if (shelved && input.stoppedAt && !stopped) return { ok: false, error: "Invalid date" };
    const stoppedAt = stopped?.date ?? null;
    if (stopped && startedAt && startedAt > periodEnd(stopped)) {
      return { ok: false, error: "Start date must be before the date you stopped" };
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
      // null = exact day
      startedPrecision: started && started.precision !== "DAY" ? started.precision : null,
      finishedAt,
      finishedPrecision: finished && finished.precision !== "DAY" ? finished.precision : null,
      stoppedAt,
      stoppedPrecision: stopped && stopped.precision !== "DAY" ? stopped.precision : null,
      notReturning: shelved && input.notReturning === true,
      isReplay: Boolean(input.isReplay),
      rating,
      reviewText,
      containsSpoilers: Boolean(reviewText) && input.containsSpoilers === true,
    };

    if (input.logId) {
      const existing = await prisma.playLog.findUnique({
        where: { id: input.logId },
      });
      if (!existing || existing.userId !== userId) {
        return { ok: false, error: "Log entry not found" };
      }
      const updated = await prisma.playLog.update({ where: { id: input.logId }, data });
      await recordLogActivity(existing, updated);
    } else {
      const created = await prisma.playLog.create({
        data: { ...data, userId, gameId: game.id },
      });
      await recordLogActivity(null, created);
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
