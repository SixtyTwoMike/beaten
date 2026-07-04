import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate, toDateInput } from "@/lib/format";
import { getGame, igdbConfigured, type IgdbGame } from "@/lib/igdb";
import { getPlatforms } from "@/lib/platforms";
import { requireUser } from "@/lib/session";
import { LogButtons } from "@/components/LogButtons";
import { LogEntryActions } from "@/components/LogEntryActions";
import { Poster } from "@/components/Poster";
import { Stars } from "@/components/Stars";
import { StatusBadge } from "@/components/StatusBadge";

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const igdbId = Number(id);
  if (!Number.isInteger(igdbId) || igdbId <= 0) notFound();

  // Prefer live IGDB data; fall back to the local cache for games that were
  // logged before credentials were removed or while IGDB is unreachable.
  let game: IgdbGame | null = null;
  if (igdbConfigured()) {
    try {
      game = await getGame(igdbId);
    } catch (e) {
      console.error("IGDB getGame failed:", e);
    }
  }
  if (!game) {
    const cached = await prisma.game.findUnique({ where: { igdbId } });
    if (cached) {
      game = {
        igdbId: cached.igdbId,
        name: cached.name,
        slug: cached.slug,
        coverUrl: cached.coverUrl,
        releaseYear: cached.releaseYear,
        summary: cached.summary,
        platformIds: JSON.parse(cached.platformIds) as number[],
      };
    }
  }
  if (!game) notFound();

  const [platforms, shelves, logs] = await Promise.all([
    getPlatforms(),
    prisma.shelf.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.playLog.findMany({
      where: { userId: user.id, game: { igdbId } },
      orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const platformOptions = platforms.map((p) => ({
    id: p.id,
    name: p.name,
    abbreviation: p.abbreviation,
  }));
  const platformById = new Map(platforms.map((p) => [p.id, p]));
  const gamePlatformNames = game.platformIds
    .map((pid) => platformById.get(pid))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const modalGame = {
    igdbId: game.igdbId,
    name: game.name,
    releaseYear: game.releaseYear,
    coverUrl: game.coverUrl,
    platformIds: game.platformIds,
  };

  return (
    <div className="flex flex-col gap-8 md:flex-row">
      <div className="w-40 shrink-0 sm:w-52">
        <Poster name={game.name} coverUrl={game.coverUrl} />
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="text-3xl font-bold">
          {game.name}
          {game.releaseYear && (
            <span className="ml-3 text-xl font-normal text-fog">
              {game.releaseYear}
            </span>
          )}
        </h1>

        {gamePlatformNames.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {gamePlatformNames.map((p) => (
              <span
                key={p.id}
                className="rounded bg-card-2 px-2 py-0.5 text-xs text-fog"
                title={p.name}
              >
                {p.abbreviation ?? p.name}
              </span>
            ))}
          </div>
        )}

        {game.summary && (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-fog/90">
            {game.summary}
          </p>
        )}

        <div className="mt-6">
          <LogButtons
            game={modalGame}
            platforms={platformOptions}
            shelves={shelves}
          />
        </div>

        <div className="mt-10">
          <h2 className="text-lg font-semibold">Your log</h2>
          {logs.length === 0 ? (
            <p className="mt-2 text-sm text-fog">
              You haven&apos;t logged this game yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {logs.map((log) => {
                const platform = log.platformId
                  ? platformById.get(log.platformId)
                  : null;
                return (
                  <li
                    key={log.id}
                    className="rounded-xl border border-edge bg-card p-4"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StatusBadge status={log.status} />
                      {log.isReplay && (
                        <span className="rounded-full bg-card-2 px-2 py-0.5 text-xs text-fog">
                          ↻ Replay
                        </span>
                      )}
                      <span className="text-sm text-fog">
                        {log.finishedAt
                          ? `${log.startedAt ? `${formatDate(log.startedAt)} – ` : ""}${formatDate(log.finishedAt)}`
                          : log.startedAt
                            ? `Playing since ${formatDate(log.startedAt)}`
                            : "Currently playing"}
                      </span>
                      {platform && (
                        <span className="rounded bg-card-2 px-1.5 py-0.5 text-xs text-fog">
                          {platform.abbreviation ?? platform.name}
                        </span>
                      )}
                      <div className="ml-auto">
                        <LogEntryActions
                          game={modalGame}
                          existing={{
                            logId: log.id,
                            status: log.status,
                            platformId: log.platformId,
                            startedAt: log.startedAt
                              ? toDateInput(log.startedAt)
                              : null,
                            finishedAt: log.finishedAt
                              ? toDateInput(log.finishedAt)
                              : null,
                            isReplay: log.isReplay,
                            rating: log.rating,
                            reviewText: log.reviewText,
                          }}
                          platforms={platformOptions}
                          shelves={shelves}
                        />
                      </div>
                    </div>
                    {log.rating != null && (
                      <div className="mt-2">
                        <Stars rating={log.rating} />
                      </div>
                    )}
                    {log.reviewText && (
                      <p className="mt-2 whitespace-pre-line text-sm text-fog/90">
                        {log.reviewText}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-10 rounded-xl border border-dashed border-edge p-4">
          <h2 className="text-sm font-semibold text-fog">External links</h2>
          <p className="mt-1 text-xs text-fog/70">
            RetroAchievements, HowLongToBeat, and other integrations are coming
            in a future version.
          </p>
        </div>
      </div>
    </div>
  );
}
