import { prisma } from "./db";
import { ensureGame } from "./games";
import { MAX_SHELF_DESCRIPTION, MAX_SHELF_NAME, isIgdbId } from "./limits";

// Shelf writes for a known user, shared by the server actions and /api/v1.
// The single-shelf ones return an error message, or null on success.

export async function createShelfForUser(
  userId: string,
  name: string,
  description?: string | null
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (typeof name !== "string") return { ok: false, error: "Shelf name is required" };
  if (description != null && typeof description !== "string") return { ok: false, error: "Invalid description" };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Shelf name is required" };
  if (trimmed.length > MAX_SHELF_NAME) {
    return { ok: false, error: `Shelf name must be ${MAX_SHELF_NAME} characters or fewer` };
  }
  if ((description?.trim().length ?? 0) > MAX_SHELF_DESCRIPTION) {
    return { ok: false, error: `Description must be ${MAX_SHELF_DESCRIPTION} characters or fewer` };
  }
  const existing = await prisma.shelf.findUnique({
    where: { userId_name: { userId, name: trimmed } },
  });
  if (existing) return { ok: false, error: "You already have a shelf with that name" };
  const shelf = await prisma.shelf.create({
    data: { userId, name: trimmed, description: description?.trim() || null },
  });
  return { ok: true, id: shelf.id };
}

async function ownShelf(userId: string, shelfId: string) {
  const shelf = await prisma.shelf.findUnique({ where: { id: shelfId } });
  return shelf && shelf.userId === userId ? shelf : null;
}

export async function deleteShelfForUser(userId: string, shelfId: string): Promise<string | null> {
  if (!(await ownShelf(userId, shelfId))) return "Shelf not found";
  await prisma.shelf.delete({ where: { id: shelfId } });
  return null;
}

export async function addGameToShelfForUser(userId: string, shelfId: string, igdbId: number): Promise<string | null> {
  if (!isIgdbId(igdbId)) return "Invalid game";
  if (!(await ownShelf(userId, shelfId))) return "Shelf not found";
  const game = await ensureGame(igdbId);
  await prisma.shelfItem.upsert({
    where: { shelfId_gameId: { shelfId, gameId: game.id } },
    update: {},
    create: { shelfId, gameId: game.id },
  });
  return null;
}

// gameId is the local Game row id.
export async function removeGameFromShelfForUser(userId: string, shelfId: string, gameId: string): Promise<string | null> {
  if (!(await ownShelf(userId, shelfId))) return "Shelf not found";
  await prisma.shelfItem.deleteMany({ where: { shelfId, gameId } });
  return null;
}
