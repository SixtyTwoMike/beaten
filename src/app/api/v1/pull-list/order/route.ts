import { apiError, apiJson, apiRoute, readJson, requireApiUser } from "@/lib/api";
import { pullListJson, reorderPullListForUser } from "@/lib/pull-list";

// PUT /api/v1/pull-list/order {igdbIds: every game on the list, first to
// last} → {items, steamLinked}. 409 when the list has changed since.
export const PUT = apiRoute("api pull list order", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const error = await reorderPullListForUser(auth.userId, body.igdbIds);
  if (error) return apiError(error, error === "Invalid order" ? 400 : 409);
  return apiJson(await pullListJson(auth.userId));
});
