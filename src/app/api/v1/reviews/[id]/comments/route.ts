import { apiError, apiJson, apiRoute, readJson, requireApiUser } from "@/lib/api";
import { commentJson } from "@/lib/api-social";
import { addCommentForUser, commentsForUser, type CommentView, type SocialResult } from "@/lib/review-social";

type Params = { params: Promise<{ id: string }> };

function respond(result: SocialResult<CommentView[]>, status = 200) {
  if (!result.ok) return apiError(result.error, result.notFound ? 404 : result.error.startsWith("Too many") ? 429 : 400);
  return apiJson({ comments: result.value.map(commentJson) }, status);
}

// GET /api/v1/reviews/:logId/comments → {comments}, oldest first.
export const GET = apiRoute("api comments", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  return respond(await commentsForUser(auth.userId, (await params).id));
});

// POST /api/v1/reviews/:logId/comments {body} → 201 {comments}
export const POST = apiRoute("api add comment", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  return respond(await addCommentForUser(auth.userId, (await params).id, body.body), 201);
});
