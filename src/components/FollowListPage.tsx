import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { followList } from "@/lib/social-queries";
import { Logo } from "./Logo";
import { PeopleList } from "./PeopleList";
import { SiteFooter } from "./SiteFooter";

// Someone's followers or who they follow. Signed-in only, so the social
// graph isn't trivially scraped; people blocked either way are left out.
export async function FollowListPage({ raw, kind, page }: { raw: string; kind: "followers" | "following"; page: number }) {
  const viewer = await requireUser();
  const list = await followList(viewer.id, decodeURIComponent(raw), kind, page);
  if (!list) notFound();
  const { user, people, more } = list;
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
