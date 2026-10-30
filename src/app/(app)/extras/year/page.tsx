import Link from "next/link";
import { requireUser } from "@/lib/session";
import { yearReviewForUser } from "@/lib/year-review";
import { Poster } from "@/components/Poster";
import { YearReviewVideo } from "@/components/YearReviewVideo";
import { MONTHS, dayMonth } from "@/lib/format";

export const metadata = { title: "Year in review — Beaten" };

export default async function YearInReviewPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await requireUser();
  const thisYear = new Date().getUTCFullYear();
  const asked = Number((await searchParams).year);
  const year = Number.isInteger(asked) && asked >= 1970 && asked <= thisYear ? asked : thisYear;
  const review = await yearReviewForUser(user.id, year);
  const years = [...new Set([thisYear, ...review.years])].sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Year in review</h1>
        <p className="mt-1 text-sm text-fog">Everything you finished in a year, as a story video.</p>
      </header>

      <nav aria-label="Year" className="flex flex-wrap gap-2">
        {years.map((y) => (
          <Link
            key={y}
            href={y === thisYear ? "/extras/year" : `/extras/year?year=${y}`}
            aria-current={y === year ? "page" : undefined}
            className="rounded-full border border-edge px-3 py-1 text-sm text-fog aria-[current=page]:border-mint/60 aria-[current=page]:bg-mint/10 aria-[current=page]:text-white"
          >
            {y}
          </Link>
        ))}
      </nav>

      <section className="grid grid-cols-3 gap-3 sm:max-w-md">
        {[
          ["Finished", review.finished, "text-mint"],
          ["Beaten", review.beaten, "text-white"],
          ["Mastered", review.mastered, "text-gold"],
        ].map(([label, value, colour]) => (
          <div key={label} className="rounded-xl border border-edge bg-card p-4">
            <div className={`text-3xl font-bold ${colour}`}>{value}</div>
            <div className="text-xs uppercase tracking-wide text-fog">{label}</div>
          </div>
        ))}
      </section>

      {review.finished === 0 ? (
        <p className="text-sm text-fog">Nothing finished in {year} yet. Games you log as beaten or mastered with a {year} finish date show up here.</p>
      ) : (
        <>
          {(review.firstGame || review.bestMonth) && (
            <section className="grid gap-3 sm:grid-cols-2 sm:max-w-2xl">
              {review.firstGame && (
                <div className="flex items-center gap-4 rounded-xl border border-edge bg-card p-4">
                  <div className="w-14 shrink-0">
                    <Poster name={review.firstGame.name} coverUrl={review.firstGame.coverUrl} />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-fog">First game finished</div>
                    <div className="font-semibold text-white">{review.firstGame.name}</div>
                    <div className="text-sm text-fog">{dayMonth(review.firstGame.finishedAt)}</div>
                  </div>
                </div>
              )}
              {review.bestMonth && (
                <div className="rounded-xl border border-edge bg-card p-4">
                  <div className="text-xs uppercase tracking-wide text-fog">Most productive month</div>
                  <div className="text-2xl font-bold text-mint">{MONTHS[review.bestMonth.month - 1]}</div>
                  <div className="text-sm text-fog">
                    {review.bestMonth.count === 1 ? "1 game finished" : `${review.bestMonth.count} games finished`}
                  </div>
                </div>
              )}
            </section>
          )}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fog">Everything you finished</h2>
            <ul className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
              {[...review.games].reverse().map((g, i) => (
                <li key={`${g.igdbId}-${i}`} title={g.name}>
                  <Poster name={g.name} coverUrl={g.coverUrl} />
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-edge bg-card p-5">
            <h2 className="mb-3 font-semibold text-white">Story video</h2>
            <YearReviewVideo review={review} />
          </section>
        </>
      )}
    </div>
  );
}
