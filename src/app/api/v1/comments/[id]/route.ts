import { apiError, apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { deleteCommentForUser } from "@/lib/review-social";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/v1/comments/:id: yours, or any on your own review.
export const DELETE = apiRoute("api delete comment", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const result = await deleteCommentForUser(auth.userId, (await params).id);
  if (!result.ok) return apiError(result.error, 404);
  return apiJson({ ok: true });
});
