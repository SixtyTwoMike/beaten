import { prisma } from "./db";
import { toPartialInput } from "./format";

// A year in games, for the Year in review page and video (web and app):
// everything finished that year (by finish date, replays included, as the
// dashboard's "Finished in <year>" counts), the split by status, the
// best-rated three, the first game finished, the busiest month and the
// console played most. Games whose finish date is only a year count in the
// totals but not for the first game or the busiest month.

export type YearReviewGame = {
  igdbId: number;
  name: string;
  coverUrl: string | null;
  status: "BEATEN" | "MASTERED";
  rating: number | null; // 1–10 half stars
  finishedAt: string; // partial date
  platformId: number | null;
};

export type YearReview = {
  year: number;
  name: string;
  username: string | null;
  finished: number;
  beaten: number;
  mastered: number;
  replays: number;
  topPlatformId: number | null;
  firstGame: YearReviewGame | null; // earliest with at least a month
  bestMonth: { month: number; count: number } | null; // 1–12; ties go to the earlier month
  games: YearReviewGame[]; // in finish order
  top: YearReviewGame[]; // up to three, best rated first
  years: number[]; // years with anything finished, newest first
};

export async function yearReviewForUser(userId: string, year: number): Promise<YearReview> {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const [user, logs, all] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, username: true } }),
    prisma.playLog.findMany({
      where: { userId, finishedAt: { gte: from, lt: to }, status: { in: ["BEATEN", "MASTERED"] } },
      orderBy: [{ finishedAt: "asc" }, { createdAt: "asc" }],
      include: { game: true },
    }),
    prisma.playLog.findMany({ where: { userId, finishedAt: { not: null } }, select: { finishedAt: true } }),
  ]);
  const games: YearReviewGame[] = logs.map((l) => ({
    igdbId: l.game.igdbId,
    name: l.game.name,
    coverUrl: l.game.coverUrl,
    status: l.status as "BEATEN" | "MASTERED",
    rating: l.rating,
    finishedAt: toPartialInput(l.finishedAt!, l.finishedPrecision),
    platformId: l.platformId,
  }));
  const platformCounts = new Map<number, number>();
  for (const g of games) if (g.platformId != null) platformCounts.set(g.platformId, (platformCounts.get(g.platformId) ?? 0) + 1);
  const topPlatformId = [...platformCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const seen = new Set<number>();
  const top = [...games]
    .filter((g) => g.rating != null)
    .sort((a, b) => b.rating! - a.rating!)
    .filter((g) => !seen.has(g.igdbId) && seen.add(g.igdbId))
    .slice(0, 3);
  const dated = games.filter((g) => g.finishedAt.length >= 7);
  const monthCounts = new Map<number, number>();
  for (const g of dated) {
    const m = Number(g.finishedAt.slice(5, 7));
    monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1);
  }
  const best = [...monthCounts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const years = [...new Set(all.map((l) => l.finishedAt!.getUTCFullYear()))].sort((a, b) => b - a);
  return {
    year,
    name: user.name ?? user.username ?? "Player",
    username: user.username,
    finished: games.length,
    beaten: games.filter((g) => g.status === "BEATEN").length,
    mastered: games.filter((g) => g.status === "MASTERED").length,
    replays: logs.filter((l) => l.isReplay).length,
    topPlatformId,
    firstGame: dated[0] ?? null,
    bestMonth: best ? { month: best[0], count: best[1] } : null,
    games,
    top,
    years,
  };
}
