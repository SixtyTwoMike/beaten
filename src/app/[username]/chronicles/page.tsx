import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadChronicle } from "@/lib/chronicle";
import { prisma } from "@/lib/db";
import { normalizeUsername } from "@/lib/username";
import { ChronicleMap } from "@/components/ChronicleMap";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";

// Someone's console chronicle, public like their profile. Outside the (app)
// group so it needs no sign-in.

type Params = { params: Promise<{ username: string }> };

async function findUser(raw: string) {
  return prisma.user.findUnique({
    where: { username: normalizeUsername(decodeURIComponent(raw)) },
    select: { id: true, name: true, username: true, chronicle: { select: { userId: true } } },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const user = await findUser((await params).username);
  if (!user?.chronicle) return { title: "Not found — Beaten" };
  const display = user.name || `@${user.username}`;
  const title = `${display}'s Console Chronicles — Beaten`;
  const description = `Every console ${display} has owned, in the order they got them.`;
  const card = { url: `/${user.username}/chronicles/card`, width: 1200, height: 630 };
  return {
    title,
    description,
    openGraph: { title, description, type: "profile", images: [card] },
    twitter: { card: "summary_large_image", title, description, images: [card.url] },
  };
}

export default async function ChroniclePage({ params }: Params) {
  const user = await findUser((await params).username);
  if (!user?.username || !user.chronicle) notFound();
  const view = await loadChronicle(user);
  if (view.stops.length === 0) notFound();
  const session = await auth();
  const isOwner = session?.user?.id === user.id;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-edge">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <Logo href="/" />
          <Link href={`/${user.username}`} className="ml-auto text-sm text-fog hover:text-white">
            @{user.username}&apos;s profile
          </Link>
          {isOwner && (
            <Link href="/extras/chronicles" className="rounded-md border border-edge px-3 py-1.5 text-sm text-fog hover:text-white">
              Edit
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <ChronicleMap view={view} />
      </main>
      <SiteFooter />
    </div>
  );
}
