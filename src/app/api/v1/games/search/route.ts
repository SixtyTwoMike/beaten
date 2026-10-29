import { apiError, apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { gameJson } from "@/lib/api-json";
import { igdbConfigured, searchGames } from "@/lib/igdb";
import { isIgdbId } from "@/lib/limits";

const MAX_QUERY = 100;

// GET /api/v1/games/search?q=&platform= → {results}
export const GET = apiRoute("api search", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  if (!igdbConfigured()) return apiError("Search isn't available right now", 503);
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);
  const platformId = Number(searchParams.get("platform"));
  if (q.length < 2) return apiJson({ results: [] });
  try {
    const results = await searchGames(q, isIgdbId(platformId) ? platformId : undefined);
    return apiJson({ results: results.map(gameJson) });
  } catch (e) {
    console.error("IGDB search failed:", e);
    return apiError("Search failed — try again in a moment", 502);
  }
});
