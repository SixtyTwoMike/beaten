import { Nav } from "@/components/Nav";
import { requireUser } from "@/lib/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  return (
    <>
      <Nav userName={user.name ?? user.email ?? "Player"} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
      <footer className="border-t border-edge py-6 text-center text-xs text-fog/60">
        Beaten — game data{" "}
        {process.env.IGDB_MOCK === "1" ? "from built-in sample catalog" : "via IGDB"}
      </footer>
    </>
  );
}
