import { prisma } from "./db";
import { getGame, getGames, type IgdbGame } from "./igdb";

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

// Local Game rows for many IGDB ids at once: cached rows as they are, the
// rest fetched from IGDB in one request. Ids IGDB doesn't know are left out.
export async function ensureGames(igdbIds: number[]) {
  const ids = [...new Set(igdbIds)];
  const rows = await prisma.game.findMany({ where: { igdbId: { in: ids } } });
  const have = new Set(rows.map((g) => g.igdbId));
  const missing = ids.filter((id) => !have.has(id));
  if (missing.length) {
    for (const g of await getGames(missing)) {
      rows.push(
        await prisma.game.upsert({
          where: { igdbId: g.igdbId },
          update: {},
          create: {
            igdbId: g.igdbId,
            name: g.name,
            slug: g.slug,
            coverUrl: g.coverUrl,
            artworkUrl: g.artworkUrl,
            releaseYear: g.releaseYear,
            summary: g.summary,
            platformIds: JSON.stringify(g.platformIds),
          },
        })
      );
    }
  }
  return new Map(rows.map((g) => [g.igdbId, g]));
}
