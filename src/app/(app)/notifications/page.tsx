import Link from "next/link";
import { resolveAvatar } from "@/lib/avatar";
import { timeAgo } from "@/lib/format";
import { describeNotification, markNotificationsRead, notificationsFor, reviewPath } from "@/lib/notifications";
import { requireUser } from "@/lib/session";
import { Avatar } from "@/components/Avatar";
import { Poster } from "@/components/Poster";

export const metadata = { title: "Notifications — Beaten" };

// Comments and reactions on your reviews, newest first. Opening the page
// marks them read (unread ones stay highlighted this once).
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const user = await requireUser();
  const raw = (await searchParams).before;
  const before = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : undefined;
  const { items, more } = await notificationsFor(user.id, before);
  if (!before) await markNotificationsRead(user.id);

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <Link href="/settings#notifications" className="text-sm text-mint hover:underline">
          Email settings →
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-edge bg-card/50 p-6 text-center text-sm text-fog">
          Nothing yet. When people react to or comment on your reviews, it shows up here.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-edge rounded-xl border border-edge bg-card">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={reviewPath(n.playLog.user.username, n.playLog.id)}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-card-2 ${n.readAt ? "" : "bg-mint/5"}`}
              >
                <Avatar avatar={resolveAvatar(n.actor)} image={n.actor.image} name={n.actor.name || n.actor.username || "?"} size={36} />
                <p className="min-w-0 flex-1 break-words text-sm text-fog">
                  {!n.readAt && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-mint" aria-label="New" />}
                  {describeNotification(n)}
                  <span className="text-fog/70"> · {timeAgo(n.createdAt)}</span>
                </p>
                <div className="w-9 shrink-0">
                  <Poster name={n.playLog.game.name} coverUrl={n.playLog.game.coverUrl} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {more && (
        <div className="mt-4 text-right text-sm">
          <Link href={`/notifications?before=${encodeURIComponent(items[items.length - 1].createdAt.toISOString())}`} className="text-mint hover:underline">
            Older →
          </Link>
        </div>
      )}
    </div>
  );
}
