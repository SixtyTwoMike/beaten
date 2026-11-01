import Link from "next/link";
import { resolveAvatar } from "@/lib/avatar";
import { feedVerb, timeAgo, type FeedCard } from "@/lib/feed";
import { reviewPath } from "@/lib/notifications";
import { SUPPORT_EMAIL } from "@/lib/site";
import { Avatar } from "./Avatar";
import { Poster } from "./Poster";
import { ReviewSocialBar } from "./ReviewSocialBar";
import { ReviewText } from "./ReviewText";
import { Stars } from "./Stars";

function Who({ actor }: { actor: FeedCard["actor"] }) {
  return (
    <Link href={`/${actor.username}`} className="font-semibold text-white hover:text-mint">
      {actor.name || `@${actor.username}`}
    </Link>
  );
}

// A feed of activity cards (lib/feed.ts).
export function FeedList({ cards, viewerId }: { cards: FeedCard[]; viewerId: string }) {
  return (
    <ul className="space-y-3">
      {cards.map((card) => (
        <li key={card.key} className="flex gap-3 rounded-xl border border-edge bg-card p-4">
          <Link href={`/${card.actor.username}`} className="shrink-0">
            <Avatar avatar={resolveAvatar(card.actor)} image={card.actor.image} name={card.actor.name || card.actor.username || "?"} size={36} />
          </Link>
          {card.kind === "entry" ? (
            <div className="flex min-w-0 flex-1 gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fog">
                  <Who actor={card.actor} /> {feedVerb(card.types)}{" "}
                  <Link href={`/games/${card.game.igdbId}`} className="font-semibold text-white hover:text-mint">
                    {card.game.name}
                  </Link>
                  {card.log.isReplay && <span> again</span>}
                  <span className="text-fog/70"> · {timeAgo(card.at)}</span>
                </p>
                {card.log.rating != null && (
                  <div className="mt-1">
                    <Stars rating={card.log.rating} />
                  </div>
                )}
                {card.log.status === "SHELVED" && card.log.notReturning && (
                  <p className="mt-1 text-xs text-fog">Not going back</p>
                )}
                {card.types.includes("REVIEWED") && card.log.reviewText && (
                  <div className="mt-2">
                    <ReviewText text={card.log.reviewText} spoilers={card.log.containsSpoilers} className="text-sm text-fog/90" />
                  </div>
                )}
                {card.social && (
                  <ReviewSocialBar
                    logId={card.logId}
                    social={card.social}
                    reportEmail={SUPPORT_EMAIL}
                    reviewHref={reviewPath(card.actor.username, card.logId)}
                    author={card.actor.username}
                    own={card.actor.id === viewerId}
                  />
                )}
              </div>
              <Link href={`/games/${card.game.igdbId}`} className="w-12 shrink-0 sm:w-14">
                <Poster name={card.game.name} coverUrl={card.game.coverUrl} />
              </Link>
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fog">
                <Who actor={card.actor} /> added {card.games.length} older game{card.games.length === 1 ? "" : "s"} to their diary
                <span className="text-fog/70"> · {timeAgo(card.at)}</span>
              </p>
              <ul className="mt-2 flex gap-2">
                {card.games.slice(0, 6).map((g) => (
                  <li key={g.igdbId} className="w-10 sm:w-12">
                    <Link href={`/games/${g.igdbId}`} title={g.name}>
                      <Poster name={g.name} coverUrl={g.coverUrl} />
                    </Link>
                  </li>
                ))}
                {card.games.length > 6 && (
                  <li className="flex w-10 items-center justify-center text-xs text-fog sm:w-12">+{card.games.length - 6}</li>
                )}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
