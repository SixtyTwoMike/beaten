"use client";

import { useState, useTransition } from "react";
import { addToPullList, removeFromPullList } from "@/app/actions/pull-list";
import { safeAction } from "@/lib/safe-action";

// Adds the game to (or takes it off) the Pull List, from its game page.
export function PullButton({ igdbId, pulled }: { igdbId: number; pulled: boolean }) {
  const [on, setOn] = useState(pulled);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const r = await safeAction(() => (on ? removeFromPullList(igdbId) : addToPullList(igdbId)));
      if (!r.ok) return setError(r.error);
      setOn(!on);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={on}
        className="rounded-md border border-edge px-3 py-1.5 text-sm text-fog hover:text-white aria-pressed:border-mint/60 aria-pressed:text-mint disabled:opacity-50"
      >
        {on ? "✓ On your Pull List" : "+ Pull List"}
      </button>
      {error && <p role="alert" className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}
