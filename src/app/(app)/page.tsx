import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate, ratingToStars } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { Poster } from "@/components/Poster";
import { Stars } from "@/components/Stars";
import { StatusBadge } from "@/components/StatusBadge";

export default async function DashboardPage() {
  const user = await requireUser();
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));

  const [beatenGames, masteredGames, logsThisYear, recentLogs, ratingAgg] =
    await Promise.all([
      prisma.playLog.findMany({
        where: { userId: user.id },
        select: { gameId: true },
        distinct: ["gameId"],
      }),
      prisma.playLog.findMany({
        where: { userId: user.id, status: "MASTERED" },
        select: { gameId: true },
        distinct: ["gameId"],
      }),
      prisma.playLog.count({
        where: { userId: user.id, finishedAt: { gte: yearStart } },
      }),
      prisma.playLog.findMany({
        where: { userId: user.id },
        orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
        take: 8,
        include: { game: true },
      }),
      prisma.playLog.aggregate({
        where: { userId: user.id, rating: { not: null } },
        _avg: { rating: true },
      }),
    ]);

  const avgRating = ratingAgg._avg.rating;

  const stats = [
    { label: "Games beaten", value: beatenGames.length },
    { label: "Mastered", value: masteredGames.length },
    { label: `Finished in ${yearStart.getUTCFullYear()}`, value: logsThisYear },
    {
      label: "Average rating",
      value: avgRating ? `★ ${ratingToStars(Math.round(avgRating))}` : "—",
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, {user.name ?? "player"}
          </h1>
          <p className="mt-1 text-sm text-fog">
            Your victory log of games beaten and mastered.
          </p>
        </div>
        <Link
          href="/search"
          className="rounded-lg bg-mint px-4 py-2.5 text-sm font-semibold text-canvas hover:brightness-110 transition"
        >
          + Log a game
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-edge bg-card p-4"
          >
            <p className="text-2xl font-bold tabular-nums">{s.value}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-fog">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Recently finished</h2>
          {recentLogs.length > 0 && (
            <Link href="/log" className="text-sm text-mint hover:underline">
              View full diary →
            </Link>
          )}
        </div>

        {recentLogs.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-edge bg-card/50 p-10 text-center">
            <p className="text-lg font-medium">No games logged yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-fog">
              Search for a game you&apos;ve finished and hit &ldquo;Beaten&rdquo; —
              add a rating, review, dates, and shelves as you go.
            </p>
            <Link
              href="/search"
              className="mt-5 inline-block rounded-lg bg-mint px-5 py-2.5 text-sm font-semibold text-canvas hover:brightness-110 transition"
            >
              Find your first game
            </Link>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            {recentLogs.map((log) => (
              <Link
                key={log.id}
                href={`/games/${log.game.igdbId}`}
                className="group"
              >
                <Poster
                  name={log.game.name}
                  coverUrl={log.game.coverUrl}
                  className="transition group-hover:opacity-80"
                />
                <div className="mt-1.5 space-y-1">
                  <StatusBadge status={log.status} />
                  {log.rating && <Stars rating={log.rating} />}
                  <p className="text-xs text-fog">{formatDate(log.finishedAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
