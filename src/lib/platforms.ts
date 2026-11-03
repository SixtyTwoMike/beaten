import { prisma } from "./db";
import { fetchPlatforms, igdbConfigured } from "./igdb";
import { mockPlatforms } from "./igdb-mock";
import { isRetroPlatform } from "./played-on";
import type { PlatformOption } from "./types";

// Returns the cached platform list, lazily syncing from IGDB on first use.
// A table holding only the mock catalogue's handful (a box that ran with
// IGDB_MOCK=1 before keys were added) is synced again once IGDB is live, as
// is one synced before logos were stored.
let lastAttempt = 0;
const RETRY_MS = 10 * 60 * 1000;

// The list rarely changes, and most pages need it: keep it in memory for a
// while rather than reading ~200 rows (and two counts) on every request.
const MEMO_MS = 10 * 60 * 1000;
let memo: { at: number; rows: Awaited<ReturnType<typeof loadPlatforms>> } | null = null;

export async function getPlatforms() {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.rows;
  const rows = await loadPlatforms();
  // Only a full (synced) list is kept; an empty or mock-sized one is
  // retried on the next request.
  if (rows.length > mockPlatforms.length || process.env.IGDB_MOCK === "1") memo = { at: Date.now(), rows };
  return rows;
}

async function loadPlatforms() {
  const count = await prisma.platform.count();
  const live = process.env.IGDB_MOCK !== "1";
  const due = count === 0 || Date.now() - lastAttempt > RETRY_MS;
  const stale =
    live && (count <= mockPlatforms.length || (await prisma.platform.count({ where: { logoImageId: { not: null } } })) === 0);
  if ((count === 0 || stale) && due && igdbConfigured()) {
    lastAttempt = Date.now();
    try {
      const platforms = await fetchPlatforms();
      await prisma.$transaction(
        platforms.map((p) =>
          prisma.platform.upsert({
            where: { id: p.id },
            update: {
              name: p.name,
              abbreviation: p.abbreviation,
              generation: p.generation,
              category: p.category,
              logoImageId: p.logoImageId,
            },
            create: p,
          })
        )
      );
    } catch (e) {
      console.error("Platform sync failed:", e);
    }
  }
  return prisma.platform.findMany({ orderBy: { name: "asc" } });
}

// What the log form's platform picker needs.
export function platformOptions(
  platforms: { id: number; name: string; abbreviation: string | null; generation: number | null; category: number | null }[]
): PlatformOption[] {
  return platforms.map((p) => ({ id: p.id, name: p.name, abbreviation: p.abbreviation, retro: isRetroPlatform(p) }));
}
