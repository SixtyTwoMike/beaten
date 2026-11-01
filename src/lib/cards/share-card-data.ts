import { prisma } from "../db";
import { AVATAR_SELECT, resolveAvatar } from "../avatar";
import { FINISHED_STATUSES } from "../status";
import { normalizeUsername } from "../username";
import type { CardGame, ShareCardData } from "./share-card-markup";

// Everything a share card can show, for both "last 4 beaten" and "last 4
// played", from what the public profile already shows. Null when there's
// no such profile. `version` changes whenever any of it might have.

const CARD_GAMES = 4;

export async function shareCardData(rawUsername: string): Promise<{ data: ShareCardData; version: string } | null> {
  const user = await prisma.user.findUnique({
    where: { username: normalizeUsername(rawUsername) },
    select: { id: true, username: true, name: true, image: true, ...AVATAR_SELECT },
  });
  if (!user?.username) return null;

  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const include = { game: { select: { id: true, name: true, coverUrl: true, artworkUrl: true } } } as const;
  const [finished, active, beatenGames, thisYear, diary] = await Promise.all([
    // Both lists need a date to say "last": undated finishes are left out.
    prisma.playLog.findMany({
      where: { userId: user.id, finishedAt: { not: null } },
      orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
      take: 20,
      include,
    }),
    prisma.playLog.findMany({
      where: { userId: user.id, OR: [{ status: { in: ["PLAYING", "SHELVED"] } }, { finishedAt: { not: null } }] },
      orderBy: [{ createdAt: "desc" }],
      take: 60,
      include,
    }),
    prisma.playLog.findMany({ where: { userId: user.id, status: { in: FINISHED_STATUSES } }, select: { gameId: true }, distinct: ["gameId"] }),
    prisma.playLog.count({ where: { userId: user.id, finishedAt: { gte: yearStart } } }),
    prisma.playLog.aggregate({ where: { userId: user.id }, _max: { updatedAt: true }, _count: true }),
  ]);

  // "Played" orders by each log's latest date (finished or put down, else
  // started, else logged), so a game you've just picked up comes before an
  // old finish.
  type Log = (typeof finished)[number];
  const lastActive = (l: Log) => (l.finishedAt ?? l.stoppedAt ?? l.startedAt ?? l.createdAt).getTime();
  // Most recent log per game, newest first.
  const pick = (logs: Log[]): CardGame[] => {
    const seen = new Set<string>();
    const out: CardGame[] = [];
    for (const log of logs) {
      if (seen.has(log.game.id)) continue;
      seen.add(log.game.id);
      out.push({
        name: log.game.name,
        coverUrl: log.game.coverUrl,
        artworkUrl: log.game.artworkUrl,
        rating: log.rating,
        finishedAt: log.finishedAt?.toISOString() ?? null,
        finishedPrecision: log.finishedPrecision,
        status: log.status,
      });
      if (out.length === CARD_GAMES) break;
    }
    return out;
  };

  const data: ShareCardData = {
    person: { display: user.name || `@${user.username}`, username: user.username, avatar: resolveAvatar(user), image: user.image },
    beaten: pick(finished),
    played: pick([...active].sort((a, b) => lastActive(b) - lastActive(a))),
    beatenCount: beatenGames.length,
    thisYear,
    year: yearStart.getUTCFullYear(),
  };
  // Count + latest edit catch adds, edits and deletes; the year is in the stats.
  const version = JSON.stringify([user, diary._count, diary._max.updatedAt?.getTime() ?? 0, data.year]);
  return { data, version };
}
