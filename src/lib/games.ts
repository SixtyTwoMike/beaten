import { prisma } from "./db";
import { getGame, type IgdbGame } from "./igdb";

// Ensure a local Game row exists for an IGDB game, refreshing cached fields.
// Game data is always re-fetched server-side from IGDB (or the mock catalog)
// so clients can only reference games by id, not inject arbitrary data.
export async function ensureGame(igdbId: number) {
  const existing = await prisma.game.findUnique({ where: { igdbId } });
  if (existing) {
    if (existing.artworkUrl || process.env.IGDB_MOCK === "1") return existing;
    // Rows cached before artwork was stored: backfill art when IGDB has it.
    const fresh = await getGame(igdbId).catch(() => null);
    if (!fresh?.artworkUrl) return existing;
    return prisma.game.update({
      where: { igdbId },
      data: {
        artworkUrl: fresh.artworkUrl,
        coverUrl: fresh.coverUrl ?? existing.coverUrl,
      },
    });
  }

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
      artworkUrl: igdbGame.artworkUrl,
      releaseYear: igdbGame.releaseYear,
      summary: igdbGame.summary,
      platformIds: JSON.stringify(igdbGame.platformIds),
    },
  });
}
