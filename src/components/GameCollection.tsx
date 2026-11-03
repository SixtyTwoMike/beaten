"use client";

import { useState } from "react";
import { copyDetails, formatPrice, type CollectionEntry } from "@/lib/collection-shared";
import type { ModalGame, PlatformOption } from "@/lib/types";
import { CollectionItemForm } from "./CollectionItemForm";

// The game page's "In your collection": your copies, and "I own this".
export function GameCollection({
  game,
  copies,
  platforms,
}: {
  game: ModalGame;
  copies: CollectionEntry[];
  platforms: PlatformOption[];
}) {
  const [editing, setEditing] = useState<CollectionEntry | "new" | null>(null);
  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-fog">In your collection</h2>
      {copies.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {copies.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <span className="rounded bg-card-2 px-1.5 py-0.5 text-xs text-fog">{c.platformName}</span>
              <span className="text-fog">{[copyDetails(c) || null, formatPrice(c.pricePaid, c.currency)].filter(Boolean).join(" · ")}</span>
              <button
                type="button"
                onClick={() => setEditing(c)}
                aria-label={`Edit your ${c.platformName} copy`}
                className="text-xs text-mint hover:underline"
              >
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setEditing("new")}
        className="mt-2 rounded-md border border-edge px-3 py-1.5 text-sm text-fog hover:border-fog/50 hover:text-white"
      >
        {copies.length ? "+ Another copy" : "I own this"}
      </button>
      {editing && (
        <CollectionItemForm
          game={game}
          platforms={platforms}
          existing={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
