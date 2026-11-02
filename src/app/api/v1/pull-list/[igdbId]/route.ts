import { apiError, apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { pullListJson, removeFromPullListForUser } from "@/lib/pull-list";

type Params = { params: Promise<{ igdbId: string }> };

// DELETE /api/v1/pull-list/:igdbId → {items, steamLinked}
export const DELETE = apiRoute("api pull list remove", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const error = await removeFromPullListForUser(auth.userId, Number((await params).igdbId));
  if (error) return apiError(error);
  return apiJson(await pullListJson(auth.userId));
});
