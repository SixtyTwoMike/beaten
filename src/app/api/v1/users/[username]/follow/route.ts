import { apiError, apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { profileJson } from "@/lib/api-social";
import { unfollowForUser, followForUser, type FollowResult } from "@/lib/follow-write";

type Params = { params: Promise<{ username: string }> };

// POST /api/v1/users/:username/follow → {profile}; DELETE to unfollow.
async function respond(request: Request, { params }: Params, call: (userId: string, username: string) => Promise<FollowResult>) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const username = decodeURIComponent((await params).username);
  const result = await call(auth.userId, username);
  if (!result.ok) return apiError(result.error, result.error.startsWith("Too many") ? 429 : 403);
  const profile = await profileJson(auth.userId, username);
  return profile ? apiJson({ profile }) : apiError("Profile not found", 404);
}

export const POST = apiRoute("api follow", (request: Request, ctx: Params) => respond(request, ctx, followForUser));
export const DELETE = apiRoute("api unfollow", (request: Request, ctx: Params) => respond(request, ctx, unfollowForUser));
