import { apiError, apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { personJson } from "@/lib/api-social";
import { followList } from "@/lib/social-queries";

type Params = { params: Promise<{ username: string }> };

// GET /api/v1/users/:username/followers?page=0 → {people, more}
export const GET = apiRoute("api followers", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const n = Number(new URL(request.url).searchParams.get("page") ?? 0);
  const page = Number.isInteger(n) && n >= 0 && n < 1000 ? n : 0;
  const list = await followList(auth.userId, decodeURIComponent((await params).username), "followers", page);
  if (!list) return apiError("Profile not found", 404);
  return apiJson({ people: list.people.map(personJson), more: list.more });
});
