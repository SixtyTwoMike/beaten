import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatPartialDate } from "@/lib/format";
import type { SessionUser } from "@/lib/session";
import { FINISHED_STATUSES } from "@/lib/status";
import { getFeed } from "@/lib/feed";
import { FeedList } from "@/components/FeedList";
import { Poster } from "@/components/Poster";
import { Stars } from "@/components/Stars";
import { StatusBadge } from "@/components/StatusBadge";

// Signed-in home page (rendered by src/app/page.tsx).
export async function Dashboard({ user }: { user: SessionUser }) {
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));

  const [profile, beatenGames, masteredGames, logsThisYear, playingLogs, recentLogs, feed] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: { username: true },
      }),
      prisma.playLog.findMany({
        where: { userId: user.id, status: { in: FINISHED_STATUSES } },
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
        where: { userId: user.id, status: "PLAYING" },
        orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
        include: { game: true },
      }),
      prisma.playLog.findMany({
        where: { userId: user.id, finishedAt: { not: null } },
        orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
        take: 8,
        include: { game: true },
      }),
      getFeed(user.id, "following"),
    ]);

  // One "now playing" entry per game (most-recent first from the query order).
  const playingByGame = new Map<string, (typeof playingLogs)[number]>();
  for (const log of playingLogs) {
    if (!playingByGame.has(log.gameId)) playingByGame.set(log.gameId, log);
  }
  const currentlyPlaying = [...playingByGame.values()];

  const stats = [
    { label: "Now playing", value: currentlyPlaying.length },
    { label: "Games beaten", value: beatenGames.length },
    { label: "Mastered", value: masteredGames.length },
    { label: `Finished in ${yearStart.getUTCFullYear()}`, value: logsThisYear },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, {user.name ?? "player"}
          </h1>
          <p className="mt-1 text-sm text-fog">
            Your log of games playing, beaten, and mastered.
          </p>
        </div>
        <Link
          href="/search"
          className="rounded-lg bg-mint px-4 py-2.5 text-sm font-semibold text-canvas hover:brightness-110 transition"
        >
          + Log a game
        </Link>
      </div>

      {!profile?.username && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-mint/30 bg-mint/5 p-4 text-sm">
          <p>Pick a username to get a public profile page you can share.</p>
          <Link href="/settings" className="font-semibold text-mint hover:underline">
            Set username →
          </Link>
        </div>
      )}

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

      {currentlyPlaying.length > 0 && (
        <div className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Currently playing</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            {currentlyPlaying.map((log) => (
              <Link
                key={log.id}
                href={`/games/${log.game.igdbId}`}
                className="group"
              >
                <Poster
                  name={log.game.name}
                  coverUrl={log.game.coverUrl}
                  className="ring-1 ring-sky/40 transition group-hover:opacity-80"
                />
                <div className="mt-1.5 space-y-1">
                  <StatusBadge status={log.status} />
                  {log.startedAt && (
                    <p className="text-xs text-fog">
                      Since {formatPartialDate(log.startedAt, log.startedPrecision)}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Recently beaten</h2>
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
                  <p className="text-xs text-fog">{formatPartialDate(log.finishedAt, log.finishedPrecision)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div id="following-feed" className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">From people you follow</h2>
          {feed.cards.length > 0 && (
            <Link href="/activity" className="text-sm text-mint hover:underline">
              All activity →
            </Link>
          )}
        </div>
        {feed.cards.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-edge bg-card/50 p-6 text-center text-sm text-fog">
            {feed.followsAnyone
              ? "Nothing from the people you follow yet."
              : "Follow people to see what they're playing, beating and reviewing."}{" "}
            <Link href="/people" className="text-mint hover:underline">
              Find people →
            </Link>
          </div>
        ) : (
          <div className="mt-4">
            <FeedList cards={feed.cards.slice(0, 6)} />
          </div>
        )}
      </div>
    </div>
  );
}
