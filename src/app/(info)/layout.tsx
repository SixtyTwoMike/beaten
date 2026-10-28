import Link from "next/link";
import { auth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";

// Public reading pages (support, privacy): no sign-in needed.
export default async function InfoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);
  return (
    <>
      <header className="border-b border-edge bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <Logo href="/" />
          <Link
            href={signedIn ? "/" : "/login"}
            className="ml-auto text-sm text-fog hover:text-white"
          >
            {signedIn ? "Back to your log" : "Sign in"}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 text-sm leading-relaxed text-[#dbe4ec]">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
