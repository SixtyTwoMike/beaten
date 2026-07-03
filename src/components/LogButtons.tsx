"use client";

import { useState } from "react";
import type { ModalGame, PlatformOption, ShelfOption } from "@/lib/types";
import { LogGameModal } from "./LogGameModal";

export function LogButtons({
  game,
  platforms,
  shelves,
}: {
  game: ModalGame;
  platforms: PlatformOption[];
  shelves: ShelfOption[];
}) {
  const [modalStatus, setModalStatus] = useState<"BEATEN" | "MASTERED" | null>(
    null
  );
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => setModalStatus("BEATEN")}
        className="rounded-lg bg-mint px-4 py-2.5 text-sm font-semibold text-canvas hover:brightness-110 transition"
      >
        ✓ I&apos;ve beaten this
      </button>
      <button
        onClick={() => setModalStatus("MASTERED")}
        className="rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-canvas hover:brightness-110 transition"
      >
        ★ I&apos;ve mastered this
      </button>
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
