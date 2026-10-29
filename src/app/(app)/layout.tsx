import { AppShell } from "@/components/AppShell";
import { GuestChronicleImportLoader } from "@/components/GuestChronicleLoader";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  // For bringing across a chronicle made before signing in.
  const hasChronicle = (await prisma.chronicleEntry.count({ where: { userId: user.id } })) > 0;
  return (
    <AppShell user={user}>
      <GuestChronicleImportLoader hasChronicle={hasChronicle} />
      {children}
    </AppShell>
  );
}
