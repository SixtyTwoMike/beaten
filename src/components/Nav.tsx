"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const links = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Search" },
  { href: "/log", label: "Diary" },
  { href: "/shelves", label: "Shelves" },
];

export function Nav({ userName }: { userName: string }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-xl font-black tracking-tight">
          BEAT<span className="text-mint">EN</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {links.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 transition ${
                  active
                    ? "bg-card-2 text-white"
                    : "text-fog hover:bg-card hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-fog sm:inline">{userName}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-md border border-edge px-3 py-1.5 text-fog hover:border-fog/50 hover:text-white transition"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
