import type { PlayLog } from "@prisma/client";
import { prisma } from "./db";
import { ensureGame } from "./games";
import { MAX_REVIEW, MAX_SHELF_NAME, MAX_SHELVES_PER_LOG, isIgdbId } from "./limits";
import { recordLogActivity } from "./activity";
import { parsePartialDate, periodEnd } from "./dates";
import type { DatePrecision } from "./format";
import { isFinishedStatus, isPlayStatus } from "./status";

// Play-log writes for a known user. The web's server actions and the
// /api/v1 routes both call these, so validation and ownership checks live
// in one place.

export type SaveLogInput = {
  logId?: string;
  // New logs only: an id chosen by the client (the iPhone app), so a retried
  // request finds the log it already made instead of adding a second one.
  clientId?: string;
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

// notFound: the caller should answer 404 rather than 400.
export type LogResult = { ok: true; log: PlayLog } | { ok: false; error: string; notFound?: boolean };

const CLIENT_ID = /^[A-Za-z0-9_-]{16,40}$/;

export async function saveLogForUser(userId: string, input: SaveLogInput): Promise<LogResult> {
  if (!isIgdbId(input.igdbId)) return { ok: false, error: "Invalid game" };
  if (typeof input.status !== "string" || !isPlayStatus(input.status)) {
    return { ok: false, error: "Invalid status" };
  }
  if (input.clientId !== undefined && (typeof input.clientId !== "string" || !CLIENT_ID.test(input.clientId))) {
    return { ok: false, error: "Invalid id" };
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
  if (input.reviewText != null && typeof input.reviewText !== "string") {
    return { ok: false, error: "Invalid review" };
  }
  const reviewText = input.reviewText?.trim() || null;
  if (reviewText && reviewText.length > MAX_REVIEW) {
    return { ok: false, error: `Reviews must be ${MAX_REVIEW} characters or fewer` };
  }
  if (input.newShelfName != null && typeof input.newShelfName !== "string") {
    return { ok: false, error: "Invalid shelf name" };
  }
  const newShelfName = input.newShelfName?.trim();
  if (newShelfName && newShelfName.length > MAX_SHELF_NAME) {
    return { ok: false, error: `Shelf name must be ${MAX_SHELF_NAME} characters or fewer` };
  }
  if (input.shelfIds !== undefined && (!Array.isArray(input.shelfIds) || input.shelfIds.some((s) => typeof s !== "string"))) {
    return { ok: false, error: "Invalid shelves" };
  }
  if ((input.shelfIds?.length ?? 0) > MAX_SHELVES_PER_LOG) {
    return { ok: false, error: "Too many shelves" };
  }
  const platformId = input.platformId ?? null;
  if (platformId !== null && !isIgdbId(platformId)) {
    return { ok: false, error: "Invalid platform" };
  }

  // A retry of a create that already went through: hand back that log.
  if (!input.logId && input.clientId) {
    const made = await prisma.playLog.findUnique({ where: { id: input.clientId } });
    if (made) return made.userId === userId ? { ok: true, log: made } : { ok: false, error: "Invalid id" };
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

  let log: PlayLog;
  if (input.logId) {
    const existing = await prisma.playLog.findUnique({
      where: { id: input.logId },
    });
    if (!existing || existing.userId !== userId) {
      return { ok: false, error: "Log entry not found", notFound: true };
    }
    log = await prisma.playLog.update({ where: { id: input.logId }, data });
    await recordLogActivity(existing, log);
  } else {
    try {
      log = await prisma.playLog.create({
        data: { ...data, ...(input.clientId && { id: input.clientId }), userId, gameId: game.id },
      });
    } catch (e) {
      // Two copies of the same retried request racing: the other one won.
      const made = input.clientId && (await prisma.playLog.findUnique({ where: { id: input.clientId } }));
      if (made && made.userId === userId) return { ok: true, log: made };
      throw e;
    }
    await recordLogActivity(null, log);
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

  return { ok: true, log };
}

// false when the log doesn't exist or isn't theirs.
export async function deleteLogForUser(userId: string, logId: string): Promise<boolean> {
  const existing = await prisma.playLog.findUnique({ where: { id: logId } });
  if (!existing || existing.userId !== userId) return false;
  await prisma.playLog.delete({ where: { id: logId } });
  return true;
}
