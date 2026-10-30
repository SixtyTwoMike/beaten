import { apiError, apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { profileJson } from "@/lib/api-social";

type Params = { params: Promise<{ username: string }> };

// GET /api/v1/users/:username → {profile}: their public profile and how
// you stand with them (following, blocked, canFollow).
export const GET = apiRoute("api profile", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { username } = await params;
  const profile = await profileJson(auth.userId, decodeURIComponent(username));
  if (!profile) return apiError("Profile not found", 404);
  return apiJson({ profile });
});
