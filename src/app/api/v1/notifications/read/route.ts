import { apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { markNotificationsRead } from "@/lib/notifications";

// POST /api/v1/notifications/read → {ok}: marks them all read (seen ones
// aren't emailed).
export const POST = apiRoute("api notifications read", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  await markNotificationsRead(auth.userId);
  return apiJson({ ok: true });
});
