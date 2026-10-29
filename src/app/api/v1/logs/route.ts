import { prisma } from "@/lib/db";
import { apiError, apiJson, apiRoute, readJson, requireApiUser } from "@/lib/api";
import { logJson } from "@/lib/api-json";
import { saveLogForUser, type SaveLogInput } from "@/lib/logs";

// GET /api/v1/logs → {logs}: the whole diary, newest first. Diaries are a few
// hundred rows at most, so the app filters and groups it locally.
export const GET = apiRoute("api logs", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const logs = await prisma.playLog.findMany({
    where: { userId: auth.userId },
    orderBy: [{ updatedAt: "desc" }],
    include: { game: true },
  });
  return apiJson({ logs: logs.map(logJson) });
});

// POST /api/v1/logs {id?, igdbId, status, …SaveLogInput} → {log}
// `id` is chosen by the app, so a retried request returns the same log.
export const POST = apiRoute("api create log", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const input = body as unknown as SaveLogInput & { id?: string };
  const result = await saveLogForUser(auth.userId, { ...input, logId: undefined, clientId: input.id });
  if (!result.ok) return apiError(result.error, result.notFound ? 404 : 400);
  const log = await prisma.playLog.findUniqueOrThrow({ where: { id: result.log.id }, include: { game: true } });
  return apiJson({ log: logJson(log) }, 201);
});
