import Link from "next/link";
import { getFeed } from "@/lib/feed";
import { requireUser } from "@/lib/session";
import { FeedList } from "@/components/FeedList";

export const metadata = { title: "Activity — Beaten" };

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; before?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const tab = params.tab === "you" ? "you" : "following";
  const feed = await getFeed(user.id, tab, params.before);
  const tabs = { following: "Following", you: "You" } as const;

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Activity</h1>
        <Link href="/people" className="text-sm text-mint hover:underline">
          Find people →
        </Link>
      </div>
      <nav className="mt-4 flex gap-2 text-sm">
        {(Object.keys(tabs) as (keyof typeof tabs)[]).map((t) => (
          <Link
            key={t}
            href={t === "following" ? "/activity" : "/activity?tab=you"}
            aria-current={t === tab ? "page" : undefined}
            className="rounded-md px-3 py-1.5 text-fog hover:text-white aria-[current=page]:bg-card-2 aria-[current=page]:text-white"
          >
            {tabs[t]}
          </Link>
        ))}
      </nav>
      <div className="mt-4">
        {feed.cards.length === 0 ? (
          <p className="rounded-xl border border-dashed border-edge bg-card/50 p-6 text-center text-sm text-fog">
            {tab === "you"
              ? "Nothing yet — what you log shows up here."
              : feed.followsAnyone
                ? "Nothing from the people you follow yet."
                : "You're not following anyone yet."}
          </p>
        ) : (
          <FeedList cards={feed.cards} />
        )}
      </div>
      {feed.next && (
        <div className="mt-4 text-right text-sm">
          <Link href={`/activity?${new URLSearchParams({ ...(tab === "you" && { tab }), before: feed.next })}`} className="text-mint hover:underline">
            Older →
          </Link>
        </div>
      )}
    </div>
  );
}
