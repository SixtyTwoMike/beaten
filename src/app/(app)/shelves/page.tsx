import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Poster } from "@/components/Poster";
import { ShelfCreateForm, ShelfDeleteButton } from "@/components/ShelfControls";

export const metadata = { title: "Shelves — Beaten" };

export default async function ShelvesPage() {
  const user = await requireUser();
  const shelves = await prisma.shelf.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: {
      items: {
        orderBy: { addedAt: "desc" },
        take: 4,
        include: { game: true },
      },
      _count: { select: { items: true } },
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Shelves</h1>
      <p className="mt-1 text-sm text-fog">
        Custom collections for organizing your games — like lists, but shelfier.
      </p>

      <div className="mt-6">
        <ShelfCreateForm />
      </div>

      {shelves.length === 0 ? (
        <p className="mt-8 text-center text-sm text-fog">
          No shelves yet — create one above, or add games to a new shelf while
          logging them.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shelves.map((shelf) => (
            <div
              key={shelf.id}
              className="rounded-xl border border-edge bg-card p-4 transition hover:border-fog/40"
            >
              <div className="flex items-start justify-between gap-2">
                <Link href={`/shelves/${shelf.id}`} className="min-w-0">
                  <h2 className="truncate font-semibold hover:text-mint">
                    {shelf.name}
                  </h2>
                  <p className="text-xs text-fog">
                    {shelf._count.items}{" "}
                    {shelf._count.items === 1 ? "game" : "games"}
                  </p>
                </Link>
                <ShelfDeleteButton shelfId={shelf.id} />
              </div>
              {shelf.description && (
                <p className="mt-1 line-clamp-2 text-sm text-fog/90">
                  {shelf.description}
                </p>
              )}
              <Link
                href={`/shelves/${shelf.id}`}
                className="mt-3 grid grid-cols-4 gap-2"
              >
                {shelf.items.map((item) => (
                  <Poster
                    key={item.id}
                    name={item.game.name}
                    coverUrl={item.game.coverUrl}
                  />
                ))}
                {shelf.items.length === 0 && (
                  <div className="col-span-4 rounded-md border border-dashed border-edge p-4 text-center text-xs text-fog/60">
                    Empty shelf
                  </div>
                )}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
