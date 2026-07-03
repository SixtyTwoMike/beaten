"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createShelf,
  deleteShelf,
  removeGameFromShelf,
} from "@/app/actions/shelves";

export function ShelfCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createShelf(name, description || null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
      setDescription("");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-xl border border-edge bg-card p-4 sm:flex-row sm:items-start"
    >
      <div className="flex-1">
        <input
          type="text"
          required
          maxLength={60}
          placeholder="New shelf name (e.g. “100% Completed”, “JRPG Marathon”)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-edge bg-canvas px-3 py-2 text-sm outline-none placeholder:text-fog/60 focus:border-mint/60"
        />
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
      <input
        type="text"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="flex-1 rounded-md border border-edge bg-canvas px-3 py-2 text-sm outline-none placeholder:text-fog/60 focus:border-mint/60"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50 transition"
      >
        {pending ? "Creating…" : "Create shelf"}
      </button>
    </form>
  );
}

export function ShelfDeleteButton({ shelfId }: { shelfId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteShelf(shelfId);
      if (result.ok) {
        router.push("/shelves");
        router.refresh();
      }
    });
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5 text-xs">
        <span className="text-fog">Delete shelf?</span>
        <button
          onClick={remove}
          disabled={pending}
          className="rounded-md bg-red-500/90 px-2.5 py-1 font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          {pending ? "…" : "Yes"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-md border border-edge px-2.5 py-1 text-fog hover:text-white"
        >
          No
        </button>
      </span>
    );
  }
  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded-md border border-edge px-2.5 py-1 text-xs text-fog hover:border-red-400/60 hover:text-red-400 transition"
    >
      Delete
    </button>
  );
}

export function RemoveFromShelfButton({
  shelfId,
  gameId,
}: {
  shelfId: string;
  gameId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      await removeGameFromShelf(shelfId, gameId);
      router.refresh();
    });
  }

  return (
    <button
      onClick={remove}
      disabled={pending}
      title="Remove from shelf"
      className="rounded-md border border-edge px-2 py-1 text-xs text-fog hover:border-red-400/60 hover:text-red-400 disabled:opacity-50 transition"
    >
      {pending ? "…" : "Remove"}
    </button>
  );
}
