import { prisma } from "@/lib/db";
import { apiJson, apiRoute, requireApiUser } from "@/lib/api";

// GET /api/v1/devices → {devices}: the app's signed-in devices, this one marked.
export const GET = apiRoute("api devices", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const tokens = await prisma.apiToken.findMany({
    where: { userId: auth.userId },
    orderBy: { lastUsedAt: "desc" },
  });
  return apiJson({
    devices: tokens.map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: t.createdAt.toISOString(),
      lastUsedAt: t.lastUsedAt.toISOString(),
      current: t.id === auth.tokenId,
    })),
  });
});
