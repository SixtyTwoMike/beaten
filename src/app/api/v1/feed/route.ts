import { apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { feedCardJson } from "@/lib/api-social";
import { getFeed } from "@/lib/feed";

// GET /api/v1/feed?scope=following|you&before=<cursor> → {cards, next, followsAnyone}
// As /activity on the web; `next` is the cursor for older cards.
export const GET = apiRoute("api feed", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope") === "you" ? "you" : "following";
  const feed = await getFeed(auth.userId, scope, params.get("before") ?? undefined);
  return apiJson({ cards: feed.cards.map(feedCardJson), next: feed.next, followsAnyone: feed.followsAnyone });
});
