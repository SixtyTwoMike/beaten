import { prisma } from "./db";
import { getGame, getGames, type IgdbGame } from "./igdb";

// A Game row's cached fields from IGDB.
function gameRow(g: IgdbGame) {
  return {
    igdbId: g.igdbId,
    name: g.name,
    slug: g.slug,
    coverUrl: g.coverUrl,
    artworkUrl: g.artworkUrl,
    releaseYear: g.releaseYear,
    ...detailFields(g),
    summary: g.summary,
    platformIds: JSON.stringify(g.platformIds),
  };
}

function detailFields(g: IgdbGame) {
  return {
    releaseDate: g.releaseDate ? new Date(`${g.releaseDate}T00:00:00Z`) : null,
    genres: JSON.stringify(g.genres ?? []),
  };
}

// Genre names stored on a Game row.
export function gameGenres(genres: string | null): string[] {
  try {
    const v = JSON.parse(genres ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Rows cached before genres and release days were stored: fetch those from
// IGDB in batches and save them. Returns how many were filled in; IGDB
// failures leave rows for next time.
export async function backfillGameDetails(gameIds: string[]): Promise<number> {
  const rows = await prisma.game.findMany({
    where: { id: { in: gameIds }, genres: null },
    select: { igdbId: true },
  });
  let filled = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const fresh = await getGames(rows.slice(i, i + 500).map((r) => r.igdbId)).catch(() => []);
    for (const g of fresh) {
      await prisma.game.update({ where: { igdbId: g.igdbId }, data: detailFields(g) });
      filled++;
    }
  }
  return filled;
}

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
    create: gameRow(igdbGame),
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
          create: gameRow(g),
        })
      );
    }
  }
  return new Map(rows.map((g) => [g.igdbId, g]));
}
