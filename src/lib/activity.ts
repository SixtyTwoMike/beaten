import { prisma } from "./db";

// Records what someone did to a diary entry, at the moment they did it,
// for followers' feeds. (PlayLog rows are edited in place, so they can't
// tell a feed when a game went from Playing to Beaten.)
//
// - New entry: STARTED / BEATEN / MASTERED / SHELVED, plus REVIEWED if it
//   has a review.
// - Status moves on (Playing → Beaten, Beaten → Mastered, → Shelved): a new
//   event, replacing the previous one if that was under a day ago, so
//   "started then beat it" in one sitting is one item.
// - A review written later: REVIEWED, once per entry.
// - Anything else (rating, dates, platform, edits to a review): no event;
//   feeds show the entry as it is now.
// - Finished more than 30 days before it was logged, or date unknown:
//   marked as backfill, so feeds group it instead of showing every one.

export type ActivityType = "STARTED" | "BEATEN" | "MASTERED" | "SHELVED" | "REVIEWED";

const STATUS_EVENT: Record<string, ActivityType> = {
  PLAYING: "STARTED",
  BEATEN: "BEATEN",
  MASTERED: "MASTERED",
  SHELVED: "SHELVED",
};
const RANK: Record<string, number> = { PLAYING: 0, SHELVED: 1, BEATEN: 2, MASTERED: 3 };
const MERGE_MS = 24 * 60 * 60 * 1000;
const BACKFILL_MS = 30 * 24 * 60 * 60 * 1000;

type LogState = {
  id: string;
  userId: string;
  gameId: string;
  status: string;
  finishedAt: Date | null;
  stoppedAt?: Date | null;
  reviewText: string | null;
};

function isBackfill(log: LogState): boolean {
  const finished = log.status === "BEATEN" || log.status === "MASTERED";
  if (finished && !log.finishedAt) return true;
  const when = finished ? log.finishedAt : log.status === "SHELVED" ? log.stoppedAt : null;
  return Boolean(when && Date.now() - when.getTime() > BACKFILL_MS);
}

export async function recordLogActivity(prev: LogState | null, next: LogState) {
  const base = { actorId: next.userId, gameId: next.gameId, playLogId: next.id, backfill: isBackfill(next) };
  const statusEvent = STATUS_EVENT[next.status];

  if (!prev) {
    if (statusEvent) await prisma.activity.create({ data: { ...base, type: statusEvent } });
  } else if (prev.status !== next.status && statusEvent) {
    // Moving on (or putting it down): a new event. Going back down
    // (Mastered → Beaten) isn't news.
    const forward = next.status === "SHELVED" || RANK[next.status] > RANK[prev.status];
    if (forward) {
      const recent = await prisma.activity.findFirst({
        where: { playLogId: next.id, type: { not: "REVIEWED" }, createdAt: { gt: new Date(Date.now() - MERGE_MS) } },
        orderBy: { createdAt: "desc" },
      });
      if (recent) await prisma.activity.update({ where: { id: recent.id }, data: { type: statusEvent, backfill: base.backfill, createdAt: new Date() } });
      else await prisma.activity.create({ data: { ...base, type: statusEvent } });
    }
  }

  if (next.reviewText && !prev?.reviewText) {
    const already = await prisma.activity.count({ where: { playLogId: next.id, type: "REVIEWED" } });
    if (!already) await prisma.activity.create({ data: { ...base, type: "REVIEWED" } });
  }
}
