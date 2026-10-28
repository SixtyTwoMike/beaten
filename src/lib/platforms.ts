import { prisma } from "./db";
import { fetchPlatforms, igdbConfigured } from "./igdb";
import { mockPlatforms } from "./igdb-mock";

// Returns the cached platform list, lazily syncing from IGDB on first use.
// A table holding only the mock catalogue's handful (a box that ran with
// IGDB_MOCK=1 before keys were added) is synced again once IGDB is live.
let lastAttempt = 0;
const RETRY_MS = 10 * 60 * 1000;

export async function getPlatforms() {
  const count = await prisma.platform.count();
  const live = process.env.IGDB_MOCK !== "1";
  const due = count === 0 || Date.now() - lastAttempt > RETRY_MS;
  if ((count === 0 || (live && count <= mockPlatforms.length)) && due && igdbConfigured()) {
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
