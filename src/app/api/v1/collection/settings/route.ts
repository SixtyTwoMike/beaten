import { apiError, apiJson, apiRoute, readJson, requireApiUser } from "@/lib/api";
import { setCollectionSettings } from "@/lib/collection";

// PUT /api/v1/collection/settings {enabled?, public?} → {enabled, public}
export const PUT = apiRoute("api collection settings", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const result = await setCollectionSettings(auth.userId, body);
  if ("error" in result) return apiError(result.error);
  return apiJson(result);
});
