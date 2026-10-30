import { apiError, apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { profileJson } from "@/lib/api-social";
import { unblockForUser, blockForUser, type FollowResult } from "@/lib/follow-write";

type Params = { params: Promise<{ username: string }> };

// POST /api/v1/users/:username/block → {profile}; DELETE to unblock.
async function respond(request: Request, { params }: Params, call: (userId: string, username: string) => Promise<FollowResult>) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const username = decodeURIComponent((await params).username);
  const result = await call(auth.userId, username);
  if (!result.ok) return apiError(result.error, result.error.startsWith("Too many") ? 429 : 403);
  const profile = await profileJson(auth.userId, username);
  return profile ? apiJson({ profile }) : apiError("Profile not found", 404);
}

export const POST = apiRoute("api block", (request: Request, ctx: Params) => respond(request, ctx, blockForUser));
export const DELETE = apiRoute("api unblock", (request: Request, ctx: Params) => respond(request, ctx, unblockForUser));
