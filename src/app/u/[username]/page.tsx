import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { normalizeUsername } from "@/lib/username";
import { AVATAR_SELECT, resolveAvatar } from "@/lib/avatar";
import { blueskyUrl, instagramUrl } from "@/lib/social";
import { Avatar } from "@/components/Avatar";
import { Backdrop } from "@/components/Backdrop";
import { Logo } from "@/components/Logo";
import { Poster } from "@/components/Poster";
import { SiteFooter } from "@/components/SiteFooter";
import { Stars } from "@/components/Stars";
import { StatusBadge } from "@/components/StatusBadge";

// Public profile — deliberately outside the (app) route group so it needs no
// sign-in. Only select public fields: never the email or password hash.

// Most-recent finishes shown in the grid; the heading still shows the total.
const PROFILE_GRID_LIMIT = 48;

type Params = { params: Promise<{ username: string }> };

async function findProfile(raw: string) {
  return prisma.user.findUnique({
    where: { username: normalizeUsername(decodeURIComponent(raw)) },
    select: {
      id: true,
      username: true,
      name: true,
      image: true,
      createdAt: true,
      instagram: true,
      bluesky: true,
      ...AVATAR_SELECT,
    },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  const user = await findProfile(username);
  if (!user) return { title: "Profile not found — Beaten" };
  const display = user.name || `@${user.username}`;
  const title = `${display} (@${user.username}) — Beaten`;
  const description = `Games ${display} is playing, has beaten, and mastered.`;
  const card = { url: `/u/${user.username}/card?format=wide`, width: 1200, height: 630 };
  return {
    title,
    description,
    openGraph: { title, description, type: "profile", images: [card] },
    twitter: { card: "summary_large_image", title, description, images: [card.url] },
  };
}

export default async function ProfilePage({ params }: Params) {
  const { username } = await params;
  const user = await findProfile(username);
  if (!user) notFound();

  const session = await auth();
  const viewerSignedIn = Boolean(session?.user?.id);
  const isOwner = session?.user?.id === user.id;

  const [logs, shelves] = await Promise.all([
    prisma.playLog.findMany({
      where: { userId: user.id },
      orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
      include: { game: true },
    }),
    prisma.shelf.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: {
        items: { orderBy: { addedAt: "desc" }, take: 8, include: { game: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  const playingByGame = new Map<string, (typeof logs)[number]>();
  for (const log of logs) {
    if (log.status === "PLAYING" && !playingByGame.has(log.gameId)) {
      playingByGame.set(log.gameId, log);
    }
  }
  const currentlyPlaying = [...playingByGame.values()];
  const finished = logs.filter((l) => l.finishedAt);
  const reviews = finished.filter((l) => l.reviewText).slice(0, 10);
  const finishedShown = finished.slice(0, PROFILE_GRID_LIMIT);
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));

  const stats = [
    { label: "Now playing", value: currentlyPlaying.length },
    { label: "Games beaten", value: new Set(finished.map((l) => l.gameId)).size },
    {
      label: "Mastered",
      value: new Set(
        logs.filter((l) => l.status === "MASTERED").map((l) => l.gameId)
      ).size,
    },
    {
      label: `Finished in ${yearStart.getUTCFullYear()}`,
      value: finished.filter((l) => l.finishedAt! >= yearStart).length,
    },
  ];

  // Banner: art from what they're playing now, else their latest finish.
  const bannerArt =
    [...currentlyPlaying, ...finished].find((l) => l.game.artworkUrl)?.game
      .artworkUrl ?? null;
  const display = user.name || `@${user.username}`;

  // Game pages need an account, so only link posters for signed-in viewers.
  function GameLink({
    igdbId,
    children,
  }: {
    igdbId: number;
    children: React.ReactNode;
  }) {
    return viewerSignedIn ? (
      <Link href={`/games/${igdbId}`} className="group block">
        {children}
      </Link>
    ) : (
      <div>{children}</div>
    );
  }

  return (
    <>
      <header className="border-b border-edge bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Logo href="/" />
          <div className="ml-auto flex items-center gap-2 text-sm">
            {viewerSignedIn ? (
              <Link
                href="/"
                className="rounded-md border border-edge px-3 py-1.5 text-fog hover:border-fog/50 hover:text-white transition"
              >
                Back to your log
              </Link>
            ) : (
              <>
                <Link href="/login" className="px-3 py-1.5 text-fog hover:text-white">
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="rounded-md bg-mint px-3 py-1.5 font-semibold text-canvas hover:brightness-110 transition"
                >
                  Join Beaten
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative isolate mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Backdrop artworkUrl={bannerArt} />

        <div className={`flex items-center gap-5 ${bannerArt ? "pt-28 sm:pt-44" : ""}`}>
          <Avatar
            avatar={resolveAvatar(user)}
            image={user.image}
            name={display}
            size={80}
            className="ring-2 ring-white/15"
          />
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-bold drop-shadow">{display}</h1>
            <p className="text-sm text-fog">
              @{user.username} · Member since {formatDate(user.createdAt)}
            </p>
            {(user.instagram || user.bluesky) && (
              <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
                {user.instagram && (
                  <a
                    href={instagramUrl(user.instagram)}
                    rel="me noopener noreferrer"
                    target="_blank"
                    className="text-fog hover:text-white"
                  >
                    Instagram @{user.instagram}
                  </a>
                )}
                {user.bluesky && (
                  <a
                    href={blueskyUrl(user.bluesky)}
                    rel="me noopener noreferrer"
                    target="_blank"
                    className="text-fog hover:text-white"
                  >
                    Bluesky @{user.bluesky}
                  </a>
                )}
              </p>
            )}
          </div>
          {isOwner && (
            <div className="ml-auto flex gap-4 self-start text-sm">
              <Link href="/share" className="text-mint hover:underline">
                Share card
              </Link>
              <Link href="/settings" className="text-mint hover:underline">
                Edit
              </Link>
            </div>
          )}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-edge bg-card/90 p-4">
              <p className="text-2xl font-bold tabular-nums">{s.value}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-fog">{s.label}</p>
            </div>
          ))}
        </div>

        {currentlyPlaying.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">Currently playing</h2>
            <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6 lg:grid-cols-8">
              {currentlyPlaying.map((log) => (
                <GameLink key={log.id} igdbId={log.game.igdbId}>
                  <Poster
                    name={log.game.name}
                    coverUrl={log.game.coverUrl}
                    className="ring-1 ring-sky/40 transition group-hover:opacity-80"
                  />
                  <p className="mt-1.5 truncate text-xs text-fog">{log.game.name}</p>
                </GameLink>
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-lg font-semibold">
            Finished <span className="text-fog font-normal">· {finished.length}</span>
          </h2>
          {finished.length === 0 ? (
            <p className="mt-2 text-sm text-fog">Nothing logged yet.</p>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6 lg:grid-cols-8">
              {finishedShown.map((log) => (
                <GameLink key={log.id} igdbId={log.game.igdbId}>
                  <Poster
                    name={log.game.name}
                    coverUrl={log.game.coverUrl}
                    className="transition group-hover:opacity-80"
                  />
                  <div className="mt-1.5 space-y-1">
                    <StatusBadge status={log.status} />
                    {log.rating != null && <Stars rating={log.rating} />}
                    <p className="text-xs text-fog">{formatDate(log.finishedAt)}</p>
                  </div>
                </GameLink>
              ))}
            </div>
          )}
        </section>

        {reviews.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">Recent reviews</h2>
            <ul className="mt-4 space-y-4">
              {reviews.map((log) => (
                <li key={log.id} className="flex gap-4 rounded-xl border border-edge bg-card p-4">
                  <div className="w-16 shrink-0">
                    <GameLink igdbId={log.game.igdbId}>
                      <Poster name={log.game.name} coverUrl={log.game.coverUrl} />
                    </GameLink>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 className="font-semibold">{log.game.name}</h3>
                      <StatusBadge status={log.status} />
                      {log.rating != null && <Stars rating={log.rating} />}
                    </div>
                    <p className="mt-0.5 text-xs text-fog">{formatDate(log.finishedAt)}</p>
                    <p className="mt-2 whitespace-pre-line break-words text-sm text-fog/90">
                      {log.reviewText}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {shelves.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">Shelves</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {shelves.map((shelf) => (
                <div key={shelf.id} className="rounded-xl border border-edge bg-card p-4">
                  <h3 className="break-words font-semibold">{shelf.name}</h3>
                  <p className="text-xs text-fog">
                    {shelf._count.items} {shelf._count.items === 1 ? "game" : "games"}
                  </p>
                  {shelf.description && (
                    <p className="mt-1 break-words text-sm text-fog/90">{shelf.description}</p>
                  )}
                  <div className="mt-3 grid grid-cols-8 gap-1.5">
                    {shelf.items.map((item) => (
                      <GameLink key={item.id} igdbId={item.game.igdbId}>
                        <Poster name={item.game.name} coverUrl={item.game.coverUrl} />
                      </GameLink>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
