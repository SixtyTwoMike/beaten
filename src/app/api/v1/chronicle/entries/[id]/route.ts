import { apiError, apiJson, apiRoute, readJson, requireApiUser } from "@/lib/api";
import { chronicleFor } from "@/lib/api-chronicle";
import { deleteChronicleEntryForUser, saveChronicleEntryForUser, type ChronicleEntryInput } from "@/lib/chronicle-write";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/v1/chronicle/entries/:id (the whole console, as POST) → {id, chronicle}
export const PATCH = apiRoute("api edit chronicle console", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const result = await saveChronicleEntryForUser(auth.userId, body as unknown as ChronicleEntryInput, id);
  if (!result.ok) return apiError(result.error, result.notFound ? 404 : 400);
  return apiJson({ id, chronicle: await chronicleFor(auth.userId) });
});

// DELETE /api/v1/chronicle/entries/:id → {chronicle}
export const DELETE = apiRoute("api delete chronicle console", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!(await deleteChronicleEntryForUser(auth.userId, id))) return apiError("Console not found", 404);
  return apiJson({ chronicle: await chronicleFor(auth.userId) });
});
