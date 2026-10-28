import Link from "next/link";
import { prisma } from "@/lib/db";
import { recentPopularGames } from "@/lib/igdb";
import { Coverflow, type CoverflowItem } from "./Coverflow";
import { Logo } from "./Logo";
import { SiteFooter } from "./SiteFooter";

// Public landing page at / for signed-out visitors.

const SHOWCASE_SIZE = 12;

// Recent popular releases from IGDB, topped up with games people have
// recently logged here (only game names and covers; nothing about who).
async function showcase(): Promise<CoverflowItem[]> {
  const items: CoverflowItem[] = (await recentPopularGames(SHOWCASE_SIZE)).map((g) => ({
    name: g.name,
    coverUrl: g.coverUrl,
  }));
  if (items.length < SHOWCASE_SIZE) {
    const logged = await prisma.game.findMany({
      where: { coverUrl: { not: null }, playLogs: { some: {} } },
      orderBy: { createdAt: "desc" },
      take: SHOWCASE_SIZE,
      select: { name: true, coverUrl: true },
    });
    const seen = new Set(items.map((i) => i.name));
    for (const g of logged) {
      if (items.length >= SHOWCASE_SIZE) break;
      if (!seen.has(g.name)) items.push(g);
    }
  }
  return items;
}

const FEATURES = [
  { title: "Log every run", body: "Mark games as playing, beaten or mastered, with dates, platform and replays." },
  { title: "Rate & review", body: "Half-star ratings and as many words as the ending deserves." },
  { title: "Build shelves", body: "All-timers, backlog, comfort games — curate lists however you like." },
  { title: "Share your profile", body: "A public page of everything you've finished, at your own link." },
];

export async function Landing() {
  const covers = await showcase();
  return (
    <>
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6">
          <Logo href="/" />
          <nav className="ml-auto flex items-center gap-2 text-sm">
            <Link href="/login" className="px-3 py-1.5 text-fog hover:text-white">
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-mint px-3 py-1.5 font-semibold text-canvas hover:brightness-110 transition"
            >
              Create account
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col lg:min-h-[44rem] lg:flex-row">
        <section className="relative mt-12 h-[19rem] sm:h-[28rem] lg:absolute lg:mt-0 lg:inset-y-0 lg:left-0 lg:h-auto lg:w-[56%]">
          <Coverflow items={covers} />
          {/* Blend the showcase into the text side and the page. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-canvas/60 via-transparent to-canvas lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-canvas" />
        </section>

        <section className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6 lg:flex lg:items-center lg:py-28">
          <div className="lg:ml-auto lg:w-[44%] lg:pl-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-mint">
              Your gaming diary
            </p>
            <h1 className="mt-3 text-4xl font-bold leading-tight text-white sm:text-5xl">
              Every game you&apos;ve conquered, in one place.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-fog">
              Beaten is a log for the games you play. Keep track of what
              you&apos;re playing now, everything you&apos;ve finished, and the
              ones you&apos;ve mastered, then look back on years of play.
            </p>

            <dl className="mt-8 grid gap-5 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div key={f.title}>
                  <dt className="font-semibold text-white">{f.title}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-fog">{f.body}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="rounded-lg bg-mint px-5 py-3 text-sm font-semibold text-canvas hover:brightness-110 transition"
              >
                Start your log, it&apos;s free
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-edge px-5 py-3 text-sm text-fog hover:border-fog/50 hover:text-white transition"
              >
                I have an account
              </Link>
            </div>
            <p className="mt-4 text-xs text-fog/70">
              No ads, no tracking. Export or delete your data any time.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
