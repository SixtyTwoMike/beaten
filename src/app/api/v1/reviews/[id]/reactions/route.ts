import { apiError, apiJson, apiRoute, readJson, requireApiUser } from "@/lib/api";
import { toggleReactionForUser } from "@/lib/review-social";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/reviews/:logId/reactions {kind} → {social}. Adds the
// reaction, or takes it away if you'd already added it.
export const POST = apiRoute("api react", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const result = await toggleReactionForUser(auth.userId, (await params).id, body.kind);
  if (!result.ok) return apiError(result.error, result.notFound ? 404 : result.error.startsWith("Too many") ? 429 : 400);
  return apiJson({ social: result.value });
});
