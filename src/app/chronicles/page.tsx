import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { consoleOptions } from "@/lib/chronicle";
import { GuestChronicleLoader } from "@/components/GuestChronicleLoader";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";

// Console Chronicles without an account: saved in the browser, with an
// invitation to sign up (which brings it across). Members get their own
// editor. "chronicles" is a reserved username, so this can't clash with a
// profile.

const title = "Console Chronicles — Beaten";
const description = "Every console you've owned, in the order you got them — as a timeline and a story video. No account needed.";

export const metadata: Metadata = { title, description, openGraph: { title, description } };

export default async function GuestChroniclesPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/extras/chronicles");
  const consoles = await consoleOptions();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-edge">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Logo href="/" />
          <Link href="/login" className="ml-auto text-sm text-fog hover:text-white">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <GuestChronicleLoader consoles={consoles} />
      </main>
      <SiteFooter />
    </div>
  );
}
