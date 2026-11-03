import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { publicCollection } from "@/lib/collection";
import { copyDetails, groupCollection } from "@/lib/collection-shared";
import { prisma } from "@/lib/db";
import { normalizeUsername } from "@/lib/username";
import { Logo } from "@/components/Logo";
import { Poster } from "@/components/Poster";
import { SiteFooter } from "@/components/SiteFooter";

// Someone's physical collection, when they've chosen to show it. No prices,
// notes or dates. Outside the (app) group so it needs no sign-in.

type Params = { params: Promise<{ username: string }> };

async function findUser(raw: string) {
  return prisma.user.findUnique({
    where: { username: normalizeUsername(decodeURIComponent(raw)) },
    select: { id: true, name: true, username: true },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const user = await findUser((await params).username);
  if (!user) return { title: "Not found — Beaten" };
  return { title: `${user.name || `@${user.username}`}'s collection — Beaten` };
}

export default async function PublicCollectionPage({ params }: Params) {
  const user = await findUser((await params).username);
  if (!user?.username) notFound();
  const entries = await publicCollection(user.id);
  if (!entries) notFound();
  const isOwner = (await auth())?.user?.id === user.id;
  const groups = groupCollection(entries, "platform");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-edge">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <Logo href="/" />
          <Link href={`/${user.username}`} className="ml-auto text-sm text-fog hover:text-white">
            @{user.username}&apos;s profile
          </Link>
          {isOwner && (
            <Link href="/collection" className="rounded-md border border-edge px-3 py-1.5 text-sm text-fog hover:text-white">
              Edit
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold">{user.name || `@${user.username}`}&apos;s collection</h1>
        <p className="mt-1 text-sm text-fog">
          {entries.length} {entries.length === 1 ? "copy" : "copies"} · {groups.length}{" "}
          {groups.length === 1 ? "platform" : "platforms"}
        </p>
        {groups.map((g) => (
          <section key={g.label} className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fog">
              {g.label} · {g.entries.length}
            </h2>
            <ul className="divide-y divide-edge rounded-xl border border-edge bg-card">
              {g.entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 p-3">
                  <Link href={`/games/${e.igdbId}`} className="w-10 shrink-0">
                    <Poster name={e.name} coverUrl={e.coverUrl} />
                  </Link>
                  <div className="min-w-0">
                    <Link href={`/games/${e.igdbId}`} className="font-medium hover:text-mint">
                      {e.name}
                    </Link>
                    {copyDetails(e) && <p className="text-xs text-fog">{copyDetails(e)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}
