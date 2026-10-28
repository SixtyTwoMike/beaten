"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { unblockUser } from "@/app/actions/follows";
import { safeAction } from "@/lib/safe-action";

// Accounts you've blocked, each with Unblock.
export function BlockedList({ people }: { people: { username: string; name: string | null }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (people.length === 0) return <p className="text-sm text-fog">You haven&apos;t blocked anyone.</p>;
  return (
    <ul className="divide-y divide-edge">
      {people.map((p) => (
        <li key={p.username} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="min-w-0 truncate">
            {p.name || `@${p.username}`} <span className="text-fog">@{p.username}</span>
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await safeAction(() => unblockUser(p.username));
                if (result.ok) router.refresh();
              })
            }
            className="shrink-0 rounded-md border border-edge px-3 py-1 text-fog hover:text-white disabled:opacity-50"
          >
            Unblock
          </button>
        </li>
      ))}
    </ul>
  );
}
