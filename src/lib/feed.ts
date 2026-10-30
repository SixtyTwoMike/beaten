import { prisma } from "./db";
import { PUBLIC_USER_SELECT, followingIds } from "./follows";
import type { ActivityType } from "./activity";
import { reviewSocialFor, type ReviewSocial } from "./review-social";

// Activity feeds, read from the Activity log at request time (fan-out on
// read: fine at this scale on SQLite) and grouped into cards:
// - one card per diary entry for events within a day of each other
//   ("beat and reviewed Hades II");
// - games logged long after the fact go into one card per person per day
//   ("added 12 older games to their diary").
// Cards show each entry as it is now, so later edits appear.

const FETCH = 80;
const MERGE_MS = 24 * 60 * 60 * 1000;

const ROW_INCLUDE = {
  actor: { select: PUBLIC_USER_SELECT },
  game: true,
  playLog: {
    select: {
      status: true,
      rating: true,
      reviewText: true,
      containsSpoilers: true,
      finishedAt: true,
      finishedPrecision: true,
      isReplay: true,
      notReturning: true,
    },
  },
} as const;

type Row = Awaited<ReturnType<typeof fetchRows>>[number];
export type FeedActor = Row["actor"];
export type FeedGame = Row["game"];

export type FeedCard =
  | {
      kind: "entry";
      key: string;
      logId: string;
      actor: FeedActor;
      game: FeedGame;
      types: ActivityType[];
      log: Row["playLog"];
      at: Date;
      // Reviews only: reactions and comment count (lib/review-social.ts).
      social?: ReviewSocial;
    }
  | { kind: "backfill"; key: string; actor: FeedActor; games: FeedGame[]; at: Date };

function fetchRows(actorIds: string[], before: { t: Date; id: string } | null) {
  return prisma.activity.findMany({
    where: {
      actorId: { in: actorIds },
      ...(before && { OR: [{ createdAt: { lt: before.t } }, { createdAt: before.t, id: { lt: before.id } }] }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: FETCH,
    include: ROW_INCLUDE,
  });
}

// "<ms>.<id>", base64url; anything malformed starts from the top.
export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.getTime()}.${row.id}`).toString("base64url");
}
function decodeCursor(raw: string | undefined): { t: Date; id: string } | null {
  if (!raw || raw.length > 100) return null;
  const m = /^(\d{10,15})\.([a-z0-9]{10,40})$/.exec(Buffer.from(raw, "base64url").toString());
  return m ? { t: new Date(Number(m[1])), id: m[2] } : null;
}

function group(rows: Row[]): FeedCard[] {
  const cards: FeedCard[] = [];
  const entryCard = new Map<string, Extract<FeedCard, { kind: "entry" }>>();
  const backfillCard = new Map<string, Extract<FeedCard, { kind: "backfill" }>>();
  for (const r of rows) {
    if (r.backfill && r.type !== "REVIEWED") {
      const key = `${r.actorId}:${r.createdAt.toISOString().slice(0, 10)}`;
      const card = backfillCard.get(key);
      if (card) {
        if (!card.games.some((g) => g.igdbId === r.game.igdbId)) card.games.push(r.game);
      } else {
        const c = { kind: "backfill" as const, key: `b:${r.id}`, actor: r.actor, games: [r.game], at: r.createdAt };
        backfillCard.set(key, c);
        cards.push(c);
      }
      continue;
    }
    const card = entryCard.get(r.playLogId);
    if (card && card.at.getTime() - r.createdAt.getTime() < MERGE_MS) {
      if (!card.types.includes(r.type as ActivityType)) card.types.push(r.type as ActivityType);
      continue;
    }
    const c = { kind: "entry" as const, key: `e:${r.id}`, logId: r.playLogId, actor: r.actor, game: r.game, types: [r.type as ActivityType], log: r.playLog, at: r.createdAt };
    entryCard.set(r.playLogId, c);
    cards.push(c);
  }
  return cards;
}

export async function getFeed(viewerId: string, scope: "following" | "you", rawCursor?: string) {
  const ids = scope === "you" ? [viewerId] : await followingIds(viewerId);
  if (ids.length === 0) return { cards: [] as FeedCard[], next: null, followsAnyone: false };
  const rows = await fetchRows(ids, decodeCursor(rawCursor));
  // Don't split a group across pages: stop before the last actor-day.
  const full = rows.length === FETCH;
  const kept = full ? rows.slice(0, FETCH - 10) : rows;
  const cards = group(kept);
  const reviews = cards.filter((c) => c.kind === "entry" && isReviewCard(c)) as Extract<FeedCard, { kind: "entry" }>[];
  const social = await reviewSocialFor(viewerId, reviews.map((c) => c.logId));
  for (const c of reviews) c.social = social.get(c.logId);
  return {
    cards,
    next: full ? encodeCursor(kept[kept.length - 1]) : null,
    followsAnyone: true,
  };
}

// Cards that show a review, so take reactions and comments.
export function isReviewCard(card: Extract<FeedCard, { kind: "entry" }>): boolean {
  return card.types.includes("REVIEWED") && Boolean(card.log.reviewText);
}

const VERB: Record<ActivityType, string> = {
  STARTED: "started playing",
  BEATEN: "beat",
  MASTERED: "mastered",
  SHELVED: "put down",
  REVIEWED: "reviewed",
};

// "beat and reviewed", "started playing"; the latest status wins.
export function feedVerb(types: ActivityType[]): string {
  const status = types.find((t) => t !== "REVIEWED");
  const words = [status && VERB[status], types.includes("REVIEWED") && VERB.REVIEWED].filter(Boolean);
  return words.join(" and ");
}

export { timeAgo } from "./format";
