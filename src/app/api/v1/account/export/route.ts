import { apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { buildExport } from "@/lib/export";

// GET /api/v1/account/export — the same JSON as the web's Download my data.
export const GET = apiRoute("api export", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  return apiJson(await buildExport(auth.userId));
});
