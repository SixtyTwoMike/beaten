import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { igdbConfigured } from "@/lib/igdb";
import { getPlatforms } from "@/lib/platforms";
import { requireUser } from "@/lib/session";
import { SearchClient } from "@/components/SearchClient";

export const metadata = { title: "Search — Beaten" };

export default async function SearchPage() {
  const user = await requireUser();
  const [platforms, shelves, logs] = await Promise.all([
    getPlatforms(),
    prisma.shelf.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.playLog.findMany({
      where: { userId: user.id },
      select: { game: { select: { igdbId: true } } },
    }),
  ]);
  const loggedIgdbIds = [...new Set(logs.map((l) => l.game.igdbId))];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Find a game</h1>
      <Suspense>
        <SearchClient
          platforms={platforms.map((p) => ({
            id: p.id,
            name: p.name,
            abbreviation: p.abbreviation,
          }))}
          shelves={shelves}
          loggedIgdbIds={loggedIgdbIds}
          igdbConfigured={igdbConfigured()}
        />
      </Suspense>
    </div>
  );
}
