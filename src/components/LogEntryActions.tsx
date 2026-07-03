"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteLog } from "@/app/actions/logs";
import type {
  ExistingLog,
  ModalGame,
  PlatformOption,
  ShelfOption,
} from "@/lib/types";
import { LogGameModal } from "./LogGameModal";

export function LogEntryActions({
  game,
  existing,
  platforms,
  shelves,
}: {
  game: ModalGame;
  existing: ExistingLog;
  platforms: PlatformOption[];
  shelves: ShelfOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      await deleteLog(existing.logId);
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {confirming ? (
        <>
          <span className="text-xs text-fog">Delete?</span>
          <button
            onClick={remove}
            disabled={pending}
            className="rounded-md bg-red-500/90 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {pending ? "…" : "Yes"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded-md border border-edge px-2.5 py-1 text-xs text-fog hover:text-white"
          >
            No
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border border-edge px-2.5 py-1 text-xs text-fog hover:border-fog/50 hover:text-white transition"
          >
            Edit
          </button>
          <button
            onClick={() => setConfirming(true)}
            className="rounded-md border border-edge px-2.5 py-1 text-xs text-fog hover:border-red-400/60 hover:text-red-400 transition"
          >
            Delete
          </button>
        </>
      )}
      {editing && (
        <LogGameModal
          game={game}
          platforms={platforms}
          shelves={shelves}
          existing={existing}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
