import { prisma } from "@/lib/db";
import { apiError, apiJson, apiRoute, requireApiUser } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/v1/devices/:id — signs that device out.
export const DELETE = apiRoute("api sign out device", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { count } = await prisma.apiToken.deleteMany({ where: { id: (await params).id, userId: auth.userId } });
  if (!count) return apiError("Device not found", 404);
  return apiJson({ ok: true });
});
