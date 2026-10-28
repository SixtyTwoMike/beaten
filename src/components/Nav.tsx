"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Avatar as AvatarCrop } from "@/lib/avatar";
import { Avatar } from "./Avatar";
import { Logo } from "./Logo";

const links = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Search" },
  { href: "/log", label: "Diary" },
  { href: "/shelves", label: "Shelves" },
];

export function Nav({
  userName,
  username,
  avatar,
  image,
}: {
  userName: string;
  username: string | null;
  avatar: AvatarCrop | null;
  image: string | null;
}) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Logo href="/" />
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
          <Link
            href={username ? `/u/${username}` : "/settings"}
            className="flex items-center gap-2 text-fog hover:text-white"
            title={username ? "Your public profile" : "Set up your public profile"}
          >
            <Avatar avatar={avatar} image={image} name={userName} size={28} />
            <span className="hidden sm:inline">{userName}</span>
          </Link>
          <Link
            href="/settings"
            className={`rounded-md px-2 py-1.5 transition ${
              pathname.startsWith("/settings")
                ? "text-white"
                : "text-fog hover:text-white"
            }`}
          >
            Settings
          </Link>
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
