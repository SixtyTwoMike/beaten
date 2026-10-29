import { apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { getPlatforms } from "@/lib/platforms";

// GET /api/v1/platforms → {platforms}, for pickers. Changes rarely; the app
// caches it.
export const GET = apiRoute("api platforms", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const platforms = await getPlatforms();
  return apiJson({
    platforms: platforms.map((p) => ({ id: p.id, name: p.name, abbreviation: p.abbreviation, generation: p.generation })),
  });
});
