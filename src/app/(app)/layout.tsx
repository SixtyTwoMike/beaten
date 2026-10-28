import { Nav } from "@/components/Nav";
import { SiteFooter } from "@/components/SiteFooter";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { username: true },
  });
  return (
    <>
      <Nav
        userName={user.name ?? user.email ?? "Player"}
        username={profile?.username ?? null}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
