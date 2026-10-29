import { prisma } from "@/lib/db";
import { apiError, apiJson, apiRoute, readJson, requireApiUser } from "@/lib/api";
import { logJson } from "@/lib/api-json";
import { deleteLogForUser, saveLogForUser, type SaveLogInput } from "@/lib/logs";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/v1/logs/:id {igdbId, status, …SaveLogInput} → {log}
// The whole entry is sent, as the web's log form does.
export const PATCH = apiRoute("api edit log", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const input = body as unknown as SaveLogInput;
  const result = await saveLogForUser(auth.userId, { ...input, logId: id, clientId: undefined });
  if (!result.ok) return apiError(result.error, result.notFound ? 404 : 400);
  const log = await prisma.playLog.findUniqueOrThrow({ where: { id }, include: { game: true } });
  return apiJson({ log: logJson(log) });
});

export const DELETE = apiRoute("api delete log", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!(await deleteLogForUser(auth.userId, id))) return apiError("Log entry not found", 404);
  return apiJson({ ok: true });
});
