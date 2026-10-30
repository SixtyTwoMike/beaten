import { apiError, apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { personJson } from "@/lib/api-social";
import { SEARCH_LIMIT } from "@/lib/follows";
import { isLimited, recordAttempt } from "@/lib/rate-limit";
import { searchPeople } from "@/lib/social-queries";

// GET /api/v1/people?q=<name> → {people}. Two characters or more; limited
// per account like /people on the web.
export const GET = apiRoute("api people", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().replace(/^@/, "").slice(0, 40);
  if (q.length < 2) return apiJson({ people: [] });
  const key = `people:${auth.userId}`;
  if (isLimited(key, SEARCH_LIMIT)) return apiError("That's a lot of searching — try again in a few minutes.", 429);
  recordAttempt(key, SEARCH_LIMIT);
  return apiJson({ people: (await searchPeople(auth.userId, q)).map(personJson) });
});
