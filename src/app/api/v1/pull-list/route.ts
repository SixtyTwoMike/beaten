import { apiError, apiJson, apiRoute, readJson, requireApiUser } from "@/lib/api";
import { addToPullListForUser, pullListJson as listJson } from "@/lib/pull-list";

// The Pull List. Items are in the user's order; the app sorts and groups
// them itself (lib/pull-sort.ts has the web's rules).

// GET /api/v1/pull-list → {items, steamLinked}
export const GET = apiRoute("api pull list", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  return apiJson(await listJson(auth.userId));
});

// POST /api/v1/pull-list {igdbId} → {items, steamLinked}, added at the bottom
export const POST = apiRoute("api pull list add", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const error = await addToPullListForUser(auth.userId, body.igdbId as number);
  if (error) return apiError(error);
  return apiJson(await listJson(auth.userId), 201);
});
