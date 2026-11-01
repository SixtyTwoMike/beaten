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
  { href: "/share", label: "Share" },
  { href: "/extras", label: "Extras" },
];

export function Nav({
  userName,
  username,
  avatar,
  image,
  newFollowers,
  unreadNotifications,
}: {
  userName: string;
  username: string | null;
  avatar: AvatarCrop | null;
  image: string | null;
  newFollowers: number;
  unreadNotifications: number;
}) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Logo href="/" />
        <nav className="order-last flex w-full items-center gap-0 overflow-x-auto text-[13px] min-[380px]:text-sm sm:gap-1 lg:order-none lg:w-auto">
          {links.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`shrink-0 rounded-md px-2 py-1.5 transition sm:px-3 ${
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
          {username && (
            <Link
              href="/notifications"
              aria-label={unreadNotifications > 0 ? `Notifications, ${unreadNotifications} new` : "Notifications"}
              title="Notifications"
              className={`relative rounded-md px-1.5 py-1 transition ${
                pathname.startsWith("/notifications") ? "text-white" : "text-fog hover:text-white"
              }`}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {unreadNotifications > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-mint px-1 text-[10px] font-bold text-canvas">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              )}
            </Link>
          )}
          <Link
            href={username ? (newFollowers > 0 ? `/${username}/followers` : `/${username}`) : "/settings"}
            className="relative flex items-center gap-2 text-fog hover:text-white"
            title={
              !username
                ? "Set up your public profile"
                : newFollowers > 0
                  ? `${newFollowers} new follower${newFollowers === 1 ? "" : "s"}`
                  : "Your public profile"
            }
          >
            <Avatar avatar={avatar} image={image} name={userName} size={28} />
            {newFollowers > 0 && (
              <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-mint px-1 text-[10px] font-bold text-canvas">
                {newFollowers > 9 ? "9+" : newFollowers}
              </span>
            )}
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
