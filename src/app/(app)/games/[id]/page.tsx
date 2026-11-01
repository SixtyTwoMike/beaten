import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveAvatar } from "@/lib/avatar";
import { prisma } from "@/lib/db";
import { PUBLIC_USER_SELECT, followingIds } from "@/lib/follows";
import { logDates, toPartialInput } from "@/lib/format";
import { getGame, igdbConfigured, type IgdbGame } from "@/lib/igdb";
import { isIgdbId } from "@/lib/limits";
import { getPlatforms } from "@/lib/platforms";
import { raGameUrl } from "@/lib/retroachievements";
import { reviewPath } from "@/lib/notifications";
import { reviewSocialFor } from "@/lib/review-social";
import { requireUser } from "@/lib/session";
import { SUPPORT_EMAIL } from "@/lib/site";
import { Avatar } from "@/components/Avatar";
import { Backdrop } from "@/components/Backdrop";
import { GameShelves } from "@/components/GameShelves";
import { LogButtons } from "@/components/LogButtons";
import { LogEntryActions } from "@/components/LogEntryActions";
import { Poster } from "@/components/Poster";
import { ReviewSocialBar } from "@/components/ReviewSocialBar";
import { ReviewText } from "@/components/ReviewText";
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
  if (!isIgdbId(igdbId)) notFound();

  // Games anyone has logged are cached locally (and refreshed when logged);
  // only unseen games need a live IGDB call.
  let game: IgdbGame | null = null;
  const cached = await prisma.game.findUnique({ where: { igdbId } });
  if (cached) {
    game = {
      igdbId: cached.igdbId,
      name: cached.name,
      slug: cached.slug,
      coverUrl: cached.coverUrl,
      artworkUrl: cached.artworkUrl,
      releaseYear: cached.releaseYear,
      summary: cached.summary,
      platformIds: JSON.parse(cached.platformIds) as number[],
    };
  } else if (igdbConfigured()) {
    try {
      game = await getGame(igdbId);
    } catch (e) {
      console.error("IGDB getGame failed:", e);
    }
  }
  if (!game) notFound();

  const [platforms, shelves, logs, shelfItems, raAwards] = await Promise.all([
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
    prisma.shelfItem.findMany({
      where: { shelf: { userId: user.id }, game: { igdbId } },
      select: { shelfId: true },
    }),
    // RA sets this user imported or linked to this game.
    prisma.raAward.findMany({
      where: { userId: user.id, igdbId, state: { in: ["IMPORTED", "LINKED"] } },
      select: { raGameId: true, title: true, consoleName: true },
      distinct: ["raGameId"],
    }),
  ]);

  // People you follow who've logged this game: their latest entry each.
  const friendIds = cached ? await followingIds(user.id) : [];
  const friendLogs = friendIds.length
    ? await prisma.playLog.findMany({
        where: { gameId: cached!.id, userId: { in: friendIds } },
        orderBy: [{ updatedAt: "desc" }],
        select: {
          id: true,
          userId: true,
          status: true,
          rating: true,
          reviewText: true,
          containsSpoilers: true,
          user: { select: PUBLIC_USER_SELECT },
        },
      })
    : [];
  const friends = friendLogs.filter((l, i) => friendLogs.findIndex((x) => x.userId === l.userId) === i);
  // Reactions and comments on these reviews: friends' and your own.
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { username: true, emailVerifiedAt: true } });
  const reviewIds = [...friends, ...(me?.username && me.emailVerifiedAt ? logs : [])].filter((l) => l.reviewText).map((l) => l.id);
  const reviewSocial = await reviewSocialFor(user.id, reviewIds);
  const friendRatings = friends.filter((f) => f.rating != null).map((f) => f.rating!);
  const friendAverage =
    friendRatings.length >= 3 ? friendRatings.reduce((a, b) => a + b, 0) / friendRatings.length : null;

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
    <div
      className={`relative isolate flex flex-col gap-8 md:flex-row ${
        game.artworkUrl ? "pt-40 sm:pt-56" : ""
      }`}
    >
      <Backdrop artworkUrl={game.artworkUrl} />
      <div className="w-40 shrink-0 sm:w-52">
        <Poster
          name={game.name}
          coverUrl={game.coverUrl}
          className="shadow-2xl ring-1 ring-white/10"
        />
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="text-3xl font-bold drop-shadow">
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

        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fog">On your shelves</h2>
          <div className="mt-2">
            <GameShelves
              igdbId={game.igdbId}
              gameId={cached?.id ?? null}
              shelves={shelves}
              onShelves={shelfItems.map((i) => i.shelfId)}
            />
          </div>
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
                      <span className="whitespace-nowrap text-sm text-fog">
                        {logDates(log)}
                      </span>
                      {platform && (
                        <span className="rounded bg-card-2 px-1.5 py-0.5 text-xs text-fog">
                          {platform.abbreviation ?? platform.name}
                        </span>
                      )}
                      {log.notReturning && (
                        <span className="rounded bg-card-2 px-1.5 py-0.5 text-xs text-fog">Not going back</span>
                      )}
                      <div className="ml-auto">
                        <LogEntryActions
                          game={modalGame}
                          existing={{
                            logId: log.id,
                            status: log.status,
                            platformId: log.platformId,
                            startedAt: log.startedAt
                              ? toPartialInput(log.startedAt, log.startedPrecision)
                              : null,
                            finishedAt: log.finishedAt
                              ? toPartialInput(log.finishedAt, log.finishedPrecision)
                              : null,
                            stoppedAt: log.stoppedAt ? toPartialInput(log.stoppedAt, log.stoppedPrecision) : null,
                            notReturning: log.notReturning,
                            isReplay: log.isReplay,
                            rating: log.rating,
                            reviewText: log.reviewText,
                            containsSpoilers: log.containsSpoilers,
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
                      <p className="mt-2 whitespace-pre-line break-words text-sm text-fog/90">
                        {log.reviewText}
                      </p>
                    )}
                    {reviewSocial.has(log.id) && (
                      <ReviewSocialBar
                        logId={log.id}
                        social={reviewSocial.get(log.id)!}
                        reportEmail={SUPPORT_EMAIL}
                        reviewHref={reviewPath(me!.username, log.id)}
                        own
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {friends.length > 0 && (
          <div className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">Friends who&apos;ve played this</h2>
              {friendAverage != null && (
                <p className="flex items-center gap-2 text-sm text-fog">
                  Friends&apos; average <Stars rating={Math.round(friendAverage)} />
                </p>
              )}
            </div>
            <ul className="mt-3 space-y-3">
              {friends.map((f) => (
                <li key={f.id} className="flex gap-3 rounded-xl border border-edge bg-card p-3">
                  <Link href={`/${f.user.username}`} className="shrink-0">
                    <Avatar avatar={resolveAvatar(f.user)} image={f.user.image} name={f.user.name || f.user.username || "?"} size={32} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/${f.user.username}`} className="text-sm font-semibold text-white hover:text-mint">
                        {f.user.name || `@${f.user.username}`}
                      </Link>
                      <StatusBadge status={f.status} />
                      {f.rating != null && <Stars rating={f.rating} />}
                    </div>
                    {f.reviewText && (
                      <div className="mt-1.5">
                        <ReviewText text={f.reviewText} spoilers={f.containsSpoilers} className="text-sm text-fog/90" />
                      </div>
                    )}
                    {reviewSocial.has(f.id) && (
                      <ReviewSocialBar
                        logId={f.id}
                        social={reviewSocial.get(f.id)!}
                        reportEmail={SUPPORT_EMAIL}
                        reviewHref={reviewPath(f.user.username, f.id)}
                        author={f.user.username}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-10 rounded-xl border border-dashed border-edge p-4">
          <h2 className="text-sm font-semibold text-fog">External links</h2>
          {raAwards.length > 0 ? (
            <ul className="mt-1 space-y-1 text-sm">
              {raAwards.map((a) => (
                <li key={a.raGameId}>
                  <a href={raGameUrl(a.raGameId)} target="_blank" rel="noopener noreferrer" className="text-mint hover:underline">
                    {a.title} on RetroAchievements
                  </a>
                  {a.consoleName && <span className="text-fog"> · {a.consoleName}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-fog/85">
              RetroAchievements links appear here for games you import from
              there (Settings → RetroAchievements). HowLongToBeat and more are
              coming.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
