import { apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { notificationJson } from "@/lib/api-social";
import { notificationsFor, unreadNotificationCount } from "@/lib/notifications";

// GET /api/v1/notifications?before=<ISO time> → {notifications, more, unread}
// Newest first; `before` is the last one's createdAt for older ones.
export const GET = apiRoute("api notifications", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const raw = new URL(request.url).searchParams.get("before");
  const before = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : undefined;
  const [{ items, more }, unread] = await Promise.all([notificationsFor(auth.userId, before), unreadNotificationCount(auth.userId)]);
  return apiJson({ notifications: items.map(notificationJson), more, unread });
});
