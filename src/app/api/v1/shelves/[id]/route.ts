import { apiError, apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { deleteShelfForUser } from "@/lib/shelves";

type Params = { params: Promise<{ id: string }> };

export const DELETE = apiRoute("api delete shelf", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const error = await deleteShelfForUser(auth.userId, (await params).id);
  if (error) return apiError(error, 404);
  return apiJson({ ok: true });
});
