import { prisma } from "@/lib/db";
import { apiError, apiJson, apiRoute, readJson, requireApiUser } from "@/lib/api";
import { gameJson } from "@/lib/api-json";
import { createShelfForUser } from "@/lib/shelves";

// GET /api/v1/shelves → {shelves}, each with its games (newest first).
export const GET = apiRoute("api shelves", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const shelves = await prisma.shelf.findMany({
    where: { userId: auth.userId },
    orderBy: { name: "asc" },
    include: { items: { orderBy: { addedAt: "desc" }, include: { game: true } } },
  });
  return apiJson({
    shelves: shelves.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      games: s.items.map((i) => gameJson(i.game)),
    })),
  });
});

// POST /api/v1/shelves {name, description?} → {shelf}
export const POST = apiRoute("api create shelf", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const result = await createShelfForUser(auth.userId, body.name as string, body.description as string | null);
  if (!result.ok) return apiError(result.error);
  const shelf = await prisma.shelf.findUniqueOrThrow({ where: { id: result.id } });
  return apiJson({ shelf: { id: shelf.id, name: shelf.name, description: shelf.description, games: [] } }, 201);
});
