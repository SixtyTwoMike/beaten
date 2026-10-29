import { prisma } from "@/lib/db";
import { apiError, apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { isIgdbId } from "@/lib/limits";
import { addGameToShelfForUser, removeGameFromShelfForUser } from "@/lib/shelves";

type Params = { params: Promise<{ id: string; igdbId: string }> };

// POST adds the game to the shelf, DELETE takes it off. Both are idempotent.
export const POST = apiRoute("api shelve game", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id, igdbId } = await params;
  const error = await addGameToShelfForUser(auth.userId, id, Number(igdbId));
  if (error) return apiError(error, error === "Shelf not found" ? 404 : 400);
  return apiJson({ ok: true });
});

export const DELETE = apiRoute("api unshelve game", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id, igdbId } = await params;
  const n = Number(igdbId);
  if (!isIgdbId(n)) return apiError("Invalid game");
  const game = await prisma.game.findUnique({ where: { igdbId: n }, select: { id: true } });
  // Never cached means it was never on a shelf.
  const error = game ? await removeGameFromShelfForUser(auth.userId, id, game.id) : null;
  if (error) return apiError(error, 404);
  return apiJson({ ok: true });
});
