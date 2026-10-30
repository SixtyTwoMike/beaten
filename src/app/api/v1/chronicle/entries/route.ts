import { apiError, apiJson, apiRoute, readJson, requireApiUser } from "@/lib/api";
import { chronicleFor } from "@/lib/api-chronicle";
import { saveChronicleEntryForUser, type ChronicleEntryInput } from "@/lib/chronicle-write";

// POST /api/v1/chronicle/entries {platformId, variant?, model?, gotAt, age?, note?, games?: igdbId[]}
// → {id, chronicle}. The whole chronicle comes back: badges and ages
// depend on the other consoles.
export const POST = apiRoute("api add chronicle console", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const result = await saveChronicleEntryForUser(auth.userId, body as unknown as ChronicleEntryInput);
  if (!result.ok) return apiError(result.error);
  return apiJson({ id: result.id, chronicle: await chronicleFor(auth.userId) }, 201);
});
