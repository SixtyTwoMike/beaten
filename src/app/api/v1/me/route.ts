import { apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { meJson } from "@/lib/api-me";

export const GET = apiRoute("api me", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  return apiJson(await meJson(auth.userId));
});
