"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addGameToShelf, removeGameFromShelf } from "@/app/actions/shelves";
import { safeAction } from "@/lib/safe-action";
import type { ShelfOption } from "@/lib/types";

// Shelf membership for one game, toggled directly: no play log needed, so a
// backlog shelf can hold games you haven't started.
export function GameShelves({
  igdbId,
  gameId,
  shelves,
  onShelves,
}: {
  igdbId: number;
  gameId: string | null; // local Game row, if the game has been cached
  shelves: ShelfOption[];
  onShelves: string[];
}) {
  const router = useRouter();
  const [on, setOn] = useState(() => new Set(onShelves));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(shelfId: string) {
    const adding = !on.has(shelfId);
    setError(null);
    setBusy(shelfId);
    startTransition(async () => {
      const result = adding
        ? await safeAction(() => addGameToShelf(shelfId, igdbId))
        : gameId
          ? await safeAction(() => removeGameFromShelf(shelfId, gameId))
          : { ok: true as const };
      setBusy(null);
      if (!result.ok) return setError(result.error);
      setOn((prev) => {
        const next = new Set(prev);
        if (adding) next.add(shelfId);
        else next.delete(shelfId);
        return next;
      });
      router.refresh();
    });
  }

  if (shelves.length === 0) {
    return (
      <p className="text-sm text-fog">
        <Link href="/shelves" className="text-mint hover:underline">
          Make a shelf
        </Link>{" "}
        to collect games — a backlog, favourites, anything.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Shelves">
        {shelves.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={on.has(s.id)}
            disabled={busy === s.id}
            onClick={() => toggle(s.id)}
            className="rounded-full border border-edge px-3 py-1 text-sm text-fog transition hover:border-fog/50 aria-pressed:border-mint/60 aria-pressed:bg-mint/10 aria-pressed:text-white disabled:opacity-50"
          >
            {on.has(s.id) ? "✓ " : "+ "}
            {s.name}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
