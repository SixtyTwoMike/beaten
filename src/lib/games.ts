import { prisma } from "./db";
import { getGame, type IgdbGame } from "./igdb";

// Ensure a local Game row exists for an IGDB game, refreshing cached fields.
// Game data is always re-fetched server-side from IGDB (or the mock catalog)
// so clients can only reference games by id, not inject arbitrary data.
export async function ensureGame(igdbId: number) {
  const existing = await prisma.game.findUnique({ where: { igdbId } });
  if (existing) return existing;

  const igdbGame: IgdbGame | null = await getGame(igdbId);
  if (!igdbGame) throw new Error("Game not found on IGDB");

  return prisma.game.upsert({
    where: { igdbId },
    update: {},
    create: {
      igdbId: igdbGame.igdbId,
      name: igdbGame.name,
      slug: igdbGame.slug,
      coverUrl: igdbGame.coverUrl,
      releaseYear: igdbGame.releaseYear,
      summary: igdbGame.summary,
      platformIds: JSON.stringify(igdbGame.platformIds),
    },
  });
}
