import { apiError, apiJson, apiRoute, readJson, requireApiUser } from "@/lib/api";
import { notificationSettingsFor, saveNotificationSettingsForUser } from "@/lib/notifications";

// GET /api/v1/notifications/settings → {settings: {comments, reactions}}
// PATCH with either or both ("instant" | "daily" | "weekly" | "off") → {settings}
export const GET = apiRoute("api notification settings", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  return apiJson({ settings: await notificationSettingsFor(auth.userId) });
});

export const PATCH = apiRoute("api save notification settings", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const result = await saveNotificationSettingsForUser(auth.userId, body);
  if (!result.ok) return apiError(result.error);
  return apiJson({ settings: result.settings });
});
