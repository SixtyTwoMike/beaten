import { apiError, apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { yearReviewForUser } from "@/lib/year-review";

// GET /api/v1/year-review?year=2026 → {review}. Defaults to this year.
export const GET = apiRoute("api year review", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const raw = new URL(request.url).searchParams.get("year");
  const year = raw ? Number(raw) : new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 1970 || year > new Date().getUTCFullYear()) return apiError("Invalid year");
  return apiJson({ review: await yearReviewForUser(auth.userId, year) });
});
