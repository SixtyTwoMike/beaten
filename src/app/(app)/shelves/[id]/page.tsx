import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { Poster } from "@/components/Poster";
import {
  RemoveFromShelfButton,
  ShelfDeleteButton,
} from "@/components/ShelfControls";

export default async function ShelfPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const shelf = await prisma.shelf.findUnique({
    where: { id },
    include: {
      items: { orderBy: { addedAt: "desc" }, include: { game: true } },
    },
  });
  if (!shelf || shelf.userId !== user.id) notFound();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/shelves" className="text-sm text-fog hover:text-white">
          ← Shelves
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{shelf.name}</h1>
          {shelf.description && (
            <p className="mt-1 text-sm text-fog">{shelf.description}</p>
          )}
          <p className="mt-1 text-xs text-fog/70">
            {shelf.items.length} {shelf.items.length === 1 ? "game" : "games"}
          </p>
        </div>
        <ShelfDeleteButton shelfId={shelf.id} />
      </div>

      {shelf.items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-edge bg-card/50 p-10 text-center">
          <p className="text-fog">This shelf is empty.</p>
          <Link
            href="/search"
            className="mt-3 inline-block text-sm text-mint hover:underline"
          >
            Find games to add →
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {shelf.items.map((item) => (
            <div key={item.id} className="group">
              <Link href={`/games/${item.game.igdbId}`}>
                <Poster
                  name={item.game.name}
                  coverUrl={item.game.coverUrl}
                  className="transition group-hover:opacity-80"
                />
              </Link>
              <div className="mt-1.5 flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <Link
                    href={`/games/${item.game.igdbId}`}
                    className="line-clamp-2 text-sm font-medium leading-snug hover:text-mint"
                  >
                    {item.game.name}
                  </Link>
                  <p className="text-xs text-fog/70">
                    Added {formatDate(item.addedAt)}
                  </p>
                </div>
                <RemoveFromShelfButton shelfId={shelf.id} gameId={item.gameId} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
