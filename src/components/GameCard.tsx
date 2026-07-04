"use client";

import { useState } from "react";
import Link from "next/link";
import type { ModalGame, PlatformOption, ShelfOption } from "@/lib/types";
import type { PlayStatus } from "@/lib/status";
import { LogGameModal } from "./LogGameModal";
import { Poster } from "./Poster";

// Search-result / grid card with quick "beaten" / "mastered" log actions.
export function GameCard({
  game,
  platforms,
  shelves,
  loggedIgdbIds = [],
}: {
  game: ModalGame;
  platforms: PlatformOption[];
  shelves: ShelfOption[];
  loggedIgdbIds?: number[];
}) {
  const [modalStatus, setModalStatus] = useState<PlayStatus | null>(null);
  const logged = loggedIgdbIds.includes(game.igdbId);

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-edge bg-card transition hover:border-fog/40">
      <Link href={`/games/${game.igdbId}`} className="relative block">
        <Poster name={game.name} coverUrl={game.coverUrl} className="rounded-b-none" />
        {logged && (
          <span
            className="absolute right-1.5 top-1.5 rounded-full bg-mint px-1.5 py-0.5 text-[10px] font-bold text-canvas"
            title="Already in your log"
          >
            ✓
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-2.5">
        <Link
          href={`/games/${game.igdbId}`}
          className="line-clamp-2 text-sm font-medium leading-snug hover:text-mint"
        >
          {game.name}
        </Link>
        {game.releaseYear && (
          <p className="mt-0.5 text-xs text-fog">{game.releaseYear}</p>
        )}
        <div className="mt-auto flex gap-1 pt-2.5">
          <button
            onClick={() => setModalStatus("PLAYING")}
            className="flex-1 rounded-md bg-sky/15 px-1.5 py-1.5 text-xs font-semibold text-sky hover:bg-sky hover:text-canvas transition"
          >
            Playing
          </button>
          <button
            onClick={() => setModalStatus("BEATEN")}
            className="flex-1 rounded-md bg-mint/15 px-1.5 py-1.5 text-xs font-semibold text-mint hover:bg-mint hover:text-canvas transition"
          >
            Beaten
          </button>
          <button
            onClick={() => setModalStatus("MASTERED")}
            title="Mastered / 100%"
            className="flex-1 rounded-md bg-gold/15 px-1.5 py-1.5 text-xs font-semibold text-gold hover:bg-gold hover:text-canvas transition"
          >
            100%
          </button>
        </div>
      </div>
      {modalStatus && (
        <LogGameModal
          game={game}
          platforms={platforms}
          shelves={shelves}
          defaultStatus={modalStatus}
          onClose={() => setModalStatus(null)}
        />
      )}
    </div>
  );
}
