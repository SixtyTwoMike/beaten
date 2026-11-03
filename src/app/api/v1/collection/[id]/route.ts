import { apiError, apiJson, apiRoute, readJson, requireApiUser } from "@/lib/api";
import { deleteCollectionItemForUser, updateCollectionItemForUser, type CollectionInput } from "@/lib/collection";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/v1/collection/:id {platformId, …same fields as POST} → {item}
export const PATCH = apiRoute("api collection edit", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const result = await updateCollectionItemForUser(auth.userId, (await params).id, body as unknown as CollectionInput);
  if (!result.ok) return apiError(result.error, result.notFound ? 404 : 400);
  return apiJson({ item: result.item });
});

// DELETE /api/v1/collection/:id → {ok}
export const DELETE = apiRoute("api collection remove", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const error = await deleteCollectionItemForUser(auth.userId, (await params).id);
  if (error) return apiError(error, 404);
  return apiJson({ ok: true });
});
