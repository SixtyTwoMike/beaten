"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { blockUser, followUser, unblockUser, unfollowUser } from "@/app/actions/follows";
import { safeAction } from "@/lib/safe-action";

// Follow button and the ⋯ menu (block, report) on someone's profile.
export function FollowControls({
  username,
  following,
  blocked,
  reportHref,
}: {
  username: string;
  following: boolean;
  blocked: boolean;
  reportHref: string;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await safeAction(action);
      if (!result.ok) return setError(result.error);
      setMenu(false);
      setConfirmBlock(false);
      router.refresh();
    });
  }

  return (
    <div className="relative flex flex-col items-start gap-1 sm:items-end">
      <div className="flex items-center gap-2">
        {blocked ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => unblockUser(username))}
            className="rounded-md border border-edge px-3 py-1.5 text-sm text-fog hover:text-white disabled:opacity-50"
          >
            Unblock
          </button>
        ) : following ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => unfollowUser(username))}
            className="group rounded-md border border-edge px-3 py-1.5 text-sm text-white hover:border-red-400/60 hover:text-red-300 disabled:opacity-50"
          >
            <span className="group-hover:hidden">Following</span>
            <span className="hidden group-hover:inline">Unfollow</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => followUser(username))}
            className="rounded-md bg-mint px-4 py-1.5 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50"
          >
            Follow
          </button>
        )}
        <button
          type="button"
          aria-label="More"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
          className="rounded-md border border-edge px-2.5 py-1.5 text-sm text-fog hover:text-white"
        >
          ⋯
        </button>
      </div>
      {menu && (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 sm:left-auto sm:right-0 rounded-lg border border-edge bg-card-2 p-1 text-sm shadow-xl">
          {!blocked &&
            (confirmBlock ? (
              <div className="space-y-2 p-2">
                <p className="text-xs text-fog">
                  Block @{username}? You&apos;ll stop following each other and won&apos;t see each other&apos;s activity.
                  They can still see your public profile.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => blockUser(username))}
                    className="rounded-md bg-red-500/90 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500"
                  >
                    Block
                  </button>
                  <button type="button" onClick={() => setConfirmBlock(false)} className="text-xs text-fog hover:text-white">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmBlock(true)} className="block w-full rounded px-3 py-2 text-left text-fog hover:bg-card hover:text-white">
                Block @{username}
              </button>
            ))}
          <a href={reportHref} className="block rounded px-3 py-2 text-fog hover:bg-card hover:text-white">
            Report @{username}
          </a>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
