import { Nav } from "@/components/Nav";
import { SiteFooter } from "@/components/SiteFooter";
import { prisma } from "@/lib/db";
import { AVATAR_SELECT, resolveAvatar } from "@/lib/avatar";
import type { SessionUser } from "@/lib/session";

// Chrome for signed-in pages: the (app) layout, and / when signed in.
export async function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { username: true, ...AVATAR_SELECT },
  });
  return (
    <>
      <Nav
        userName={user.name ?? user.email ?? "Player"}
        username={profile?.username ?? null}
        avatar={profile ? resolveAvatar(profile) : null}
        image={user.image ?? null}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
