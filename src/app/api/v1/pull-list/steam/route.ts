import { apiError, apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { importSteamWishlistForUser, pullListJson } from "@/lib/pull-list";

// POST /api/v1/pull-list/steam → {added, unmatched, empty, items,
// steamLinked}: new Steam wishlist games, added at the bottom. Steam is
// linked on the website.
export const POST = apiRoute("api pull list steam", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const result = await importSteamWishlistForUser(auth.userId);
  if (!result.ok) return apiError(result.error, 409);
  const { added, unmatched, empty } = result;
  return apiJson({ added, unmatched, empty, ...(await pullListJson(auth.userId)) });
});
