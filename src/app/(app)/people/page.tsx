import { SEARCH_LIMIT } from "@/lib/follows";
import { searchPeople } from "@/lib/social-queries";
import { isLimited, recordAttempt } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { PeopleList } from "@/components/PeopleList";

export const metadata = { title: "Find people — Beaten" };

// Find people by username or display name. Signed-in and rate-limited, and
// only accounts that have claimed a username (confirmed email) show up.
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const viewer = await requireUser();
  const q = ((await searchParams).q ?? "").trim().replace(/^@/, "").slice(0, 40);
  let results: Awaited<ReturnType<typeof searchPeople>> | null = null;
  let limited = false;
  if (q.length >= 2) {
    const key = `people:${viewer.id}`;
    limited = isLimited(key, SEARCH_LIMIT);
    if (!limited) {
      recordAttempt(key, SEARCH_LIMIT);
      results = await searchPeople(viewer.id, q);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Find people</h1>
      <form method="GET" role="search" className="mt-4 flex gap-2">
        <input
          // A search box, not a login: type/autocomplete (and no "username"
          // in the label) stop iOS offering saved accounts here.
          type="search"
          name="q"
          defaultValue={q}
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Search people by name"
          aria-label="Search people"
          className="w-full rounded-md border border-edge bg-card px-3 py-2 text-sm outline-none focus:border-mint/60"
        />
        <button type="submit" className="rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110">
          Search
        </button>
      </form>
      <div className="mt-6">
        {limited ? (
          <p className="text-sm text-fog">That&apos;s a lot of searching — try again in a few minutes.</p>
        ) : results ? (
          <PeopleList people={results} empty={`No one found for “${q}”.`} />
        ) : (
          <p className="text-sm text-fog">Search for friends by their Beaten username or name.</p>
        )}
      </div>
    </div>
  );
}
