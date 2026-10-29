import { apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { revokeApiToken } from "@/lib/api-tokens";

// POST /api/v1/auth/logout — revokes the token the request was made with.
export const POST = apiRoute("api logout", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  await revokeApiToken(auth.tokenId);
  return apiJson({ ok: true });
});
