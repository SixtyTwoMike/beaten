import { prisma } from "./db";
import { fetchPlatforms, igdbConfigured } from "./igdb";

// Returns the cached platform list, lazily syncing from IGDB on first use.
export async function getPlatforms() {
  const count = await prisma.platform.count();
  if (count === 0 && igdbConfigured()) {
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
