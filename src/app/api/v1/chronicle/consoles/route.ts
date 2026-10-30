import { apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { consoleJson } from "@/lib/api-chronicle";
import { consoleOptions } from "@/lib/chronicle";

// GET /api/v1/chronicle/consoles → {consoles}, for the console picker
// (popular ones first by rank). Changes rarely; the app caches it.
export const GET = apiRoute("api chronicle consoles", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const consoles = (await consoleOptions()).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return apiJson({ consoles: consoles.map(consoleJson) });
});
