import { apiError, apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { reviewJson } from "@/lib/api-social";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/reviews/:logId → {review: {log (with game), author, social, isYours}}
export const GET = apiRoute("api review", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const review = await reviewJson(auth.userId, (await params).id);
  if (!review) return apiError("That review isn't there any more", 404);
  return apiJson({ review });
});
