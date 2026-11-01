import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveAvatar } from "@/lib/avatar";
import { formatPartialDate } from "@/lib/format";
import { reviewPath } from "@/lib/notifications";
import { reviewFor } from "@/lib/review-social";
import { SUPPORT_EMAIL } from "@/lib/site";
import { normalizeUsername } from "@/lib/username";
import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import { Poster } from "@/components/Poster";
import { ReviewSocialBar } from "@/components/ReviewSocialBar";
import { ReviewText } from "@/components/ReviewText";
import { SiteFooter } from "@/components/SiteFooter";
import { Stars } from "@/components/Stars";
import { StatusBadge } from "@/components/StatusBadge";

// A review on its own page, public like the profile: the place its
// reactions and comments belong to (notifications link here). Reading and
// adding comments needs sign-in.

type Params = { params: Promise<{ username: string; id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const session = await auth();
  const review = await reviewFor(session?.user?.id ?? null, id);
  if (!review) return { title: "Review not found — Beaten" };
  const who = review.author.name || `@${review.author.username}`;
  return { title: `${who}'s review of ${review.log.game.name} — Beaten` };
}

export default async function ReviewPage({ params }: Params) {
  const { username, id } = await params;
  const session = await auth();
  const viewerId = session?.user?.id ?? null;
  const review = await reviewFor(viewerId, id);
  if (!review) notFound();
  // Renamed since the link was made: send them to the current address.
  if (review.author.username !== normalizeUsername(decodeURIComponent(username))) {
    redirect(reviewPath(review.author.username, review.log.id));
  }
  const { log, author, social } = review;
  const who = author.name || `@${author.username}`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-edge">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-3">
          <Logo href="/" />
          <Link href={`/${author.username}`} className="ml-auto text-sm text-fog hover:text-white">
            ← {who}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <article className="flex gap-4 rounded-xl border border-edge bg-card p-5">
          <div className="w-20 shrink-0">
            {viewerId ? (
              <Link href={`/games/${log.game.igdbId}`}>
                <Poster name={log.game.name} coverUrl={log.game.coverUrl} />
              </Link>
            ) : (
              <Poster name={log.game.name} coverUrl={log.game.coverUrl} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <Link href={`/${author.username}`} className="flex items-center gap-2 text-sm text-fog hover:text-white">
              <Avatar avatar={resolveAvatar(author)} image={author.image} name={who} size={24} />
              <span className="font-semibold text-white">{who}</span>
            </Link>
            <h1 className="mt-2 text-xl font-bold">{log.game.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusBadge status={log.status} />
              {log.rating != null && <Stars rating={log.rating} />}
              <span className="text-xs text-fog">{formatPartialDate(log.finishedAt, log.finishedPrecision)}</span>
            </div>
            <div className="mt-3">
              <ReviewText text={log.reviewText!} spoilers={log.containsSpoilers} className="text-fog/90" />
            </div>
            <ReviewSocialBar
              logId={log.id}
              social={social}
              reportEmail={SUPPORT_EMAIL}
              author={author.username}
              own={review.isYours}
              signedIn={Boolean(viewerId)}
              defaultOpen
            />
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
