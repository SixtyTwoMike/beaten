import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PUBLIC_USER_SELECT, blockedEitherWay } from "@/lib/follows";
import { requireUser } from "@/lib/session";
import { normalizeUsername } from "@/lib/username";
import { Logo } from "./Logo";
import { PeopleList } from "./PeopleList";
import { SiteFooter } from "./SiteFooter";

const PAGE = 50;

// Someone's followers or who they follow. Signed-in only, so the social
// graph isn't trivially scraped; people blocked either way are left out.
export async function FollowListPage({ raw, kind, page }: { raw: string; kind: "followers" | "following"; page: number }) {
  const viewer = await requireUser();
  const user = await prisma.user.findUnique({
    where: { username: normalizeUsername(decodeURIComponent(raw)) },
    select: { id: true, username: true, name: true },
  });
  if (!user?.username) notFound();
  const hidden = await blockedEitherWay(viewer.id);
  const rows =
    kind === "followers"
      ? (await prisma.follow.findMany({
          where: { followeeId: user.id },
          orderBy: { createdAt: "desc" },
          skip: page * PAGE,
          take: PAGE + 1,
          select: { follower: { select: PUBLIC_USER_SELECT } },
        })).map((f) => f.follower)
      : (await prisma.follow.findMany({
          where: { followerId: user.id },
          orderBy: { createdAt: "desc" },
          skip: page * PAGE,
          take: PAGE + 1,
          select: { followee: { select: PUBLIC_USER_SELECT } },
        })).map((f) => f.followee);
  const more = rows.length > PAGE;
  const people = rows.slice(0, PAGE).filter((p) => !hidden.has(p.id));
  // Seeing your own followers clears the new-followers dot.
  if (kind === "followers" && viewer.id === user.id) {
    await prisma.user.update({ where: { id: user.id }, data: { followersSeenAt: new Date() } });
  }
  const display = user.name || `@${user.username}`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-edge">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-3">
          <Logo href="/" />
          <Link href={`/${user.username}`} className="ml-auto text-sm text-fog hover:text-white">
            ← {display}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <div className="mb-4 flex gap-4 text-sm">
          {(["followers", "following"] as const).map((k) => (
            <Link
              key={k}
              href={`/${user.username}/${k}`}
              aria-current={k === kind ? "page" : undefined}
              className="rounded-md px-3 py-1.5 capitalize text-fog hover:text-white aria-[current=page]:bg-card-2 aria-[current=page]:text-white"
            >
              {k}
            </Link>
          ))}
        </div>
        <h1 className="sr-only">
          {display} · {kind}
        </h1>
        <PeopleList
          people={people}
          empty={kind === "followers" ? `No one follows ${display} yet.` : `${display} isn't following anyone yet.`}
        />
        <div className="mt-4 flex justify-between text-sm">
          {page > 0 ? <Link href={`?page=${page - 1}`} className="text-mint hover:underline">← Newer</Link> : <span />}
          {more && <Link href={`?page=${page + 1}`} className="text-mint hover:underline">Older →</Link>}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function pageParam(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < 1000 ? n : 0;
}
