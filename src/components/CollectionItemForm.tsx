"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToCollection, removeFromCollection, updateCollectionItem } from "@/app/actions/collection";
import {
  COMPLETENESS,
  CURRENCIES,
  MAX_COLLECTION_NOTES,
  MAX_EDITION,
  REGIONS,
  priceInput,
  type CollectionEntry,
} from "@/lib/collection-shared";
import { safeAction } from "@/lib/safe-action";
import type { ModalGame, PlatformOption } from "@/lib/types";
import { PartialDateField } from "./PartialDateField";
import { Poster } from "./Poster";

const fieldClass =
  "w-full rounded-md border border-edge bg-canvas px-3 py-2 text-sm outline-none focus:border-mint/60 focus:ring-1 focus:ring-mint/40";
const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-fog";
const optional = <span className="normal-case text-fog/85">(optional)</span>;

// Add a physical copy of a game, or edit / remove one (lib/collection).
export function CollectionItemForm({
  game,
  platforms,
  existing,
  onClose,
  onSaved,
}: {
  game: ModalGame;
  platforms: PlatformOption[];
  existing?: CollectionEntry;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const mine = platforms.filter((p) => game.platformIds.includes(p.id));
  const others = platforms.filter((p) => !game.platformIds.includes(p.id));
  const [platformId, setPlatformId] = useState(
    existing ? String(existing.platformId) : mine.length === 1 ? String(mine[0].id) : ""
  );
  const [region, setRegion] = useState(existing?.region ?? "");
  const [completeness, setCompleteness] = useState(existing?.completeness ?? "");
  const [edition, setEdition] = useState(existing?.edition ?? "");
  const [acquiredAt, setAcquiredAt] = useState(existing?.acquiredAt ?? "");
  const [currency, setCurrency] = useState(existing?.currency ?? "GBP");
  const [price, setPrice] = useState(priceInput(existing?.pricePaid, existing?.currency));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("select, input")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function done() {
    router.refresh();
    onSaved?.();
    onClose();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      platformId: Number(platformId),
      region: region || null,
      completeness: completeness || null,
      edition: edition || null,
      acquiredAt: acquiredAt || null,
      pricePaid: price || null,
      currency,
      notes: notes || null,
    };
    startTransition(async () => {
      const result = await safeAction(() =>
        existing ? updateCollectionItem(existing.id, input) : addToCollection({ ...input, igdbId: game.igdbId })
      );
      if (!result.ok) return setError(result.error);
      done();
    });
  }

  function remove() {
    if (!existing) return;
    startTransition(async () => {
      const result = await safeAction(() => removeFromCollection(existing.id));
      if (!result.ok) return setError(result.error);
      done();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-form-title"
        className="w-full max-w-lg rounded-xl border border-edge bg-card shadow-2xl"
      >
        <div className="flex items-center gap-4 border-b border-edge p-4">
          <div className="w-12 shrink-0">
            <Poster name={game.name} coverUrl={game.coverUrl} />
          </div>
          <div className="min-w-0">
            <p id="collection-form-title" className="truncate font-semibold">
              {game.name}
              {game.releaseYear && <span className="ml-2 font-normal text-fog">{game.releaseYear}</span>}
            </p>
            <p className="text-sm text-fog">{existing ? "Edit your copy" : "Add to your collection"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-md p-1.5 text-fog hover:bg-card-2 hover:text-white"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-4">
          <div>
            <label className={labelClass} htmlFor="col-platform">
              Platform
            </label>
            <select
              id="col-platform"
              required
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value)}
              className={fieldClass}
            >
              <option value="">— Choose —</option>
              {mine.length > 0 && (
                <optgroup label="This game's platforms">
                  {mine.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={mine.length ? "All platforms" : "Platforms"}>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div>
            <span className={labelClass}>What you have {optional}</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="What you have">
              {COMPLETENESS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={completeness === o.value}
                  onClick={() => setCompleteness(completeness === o.value ? "" : o.value)}
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    completeness === o.value
                      ? "border-mint bg-mint/15 text-white"
                      : "border-edge text-fog hover:border-fog/50 hover:text-white"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="col-region">
                Region {optional}
              </label>
              <select id="col-region" value={region} onChange={(e) => setRegion(e.target.value)} className={fieldClass}>
                <option value="">—</option>
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="col-edition">
                Edition {optional}
              </label>
              <input
                id="col-edition"
                value={edition}
                maxLength={MAX_EDITION}
                placeholder="e.g. Collector's Edition"
                onChange={(e) => setEdition(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <label className={labelClass} htmlFor="col-acquired">
                Got it {optional}
              </label>
              <PartialDateField id="col-acquired" value={acquiredAt} onChange={setAcquiredAt} fieldClass={fieldClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="col-price">
                Paid {optional}
              </label>
              <div className="flex gap-2">
                <select
                  aria-label="Currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={`${fieldClass} w-24 shrink-0`}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.symbol} {c.value}
                    </option>
                  ))}
                </select>
                <input
                  id="col-price"
                  inputMode="decimal"
                  value={price}
                  placeholder="0.00"
                  onChange={(e) => setPrice(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="col-notes">
              Notes {optional}
            </label>
            <textarea
              id="col-notes"
              rows={2}
              value={notes}
              maxLength={MAX_COLLECTION_NOTES}
              onChange={(e) => setNotes(e.target.value)}
              className={fieldClass}
            />
            <p className="mt-1 text-xs text-fog/80">What you paid and your notes are only ever shown to you.</p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2">
            {existing && (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="rounded-md border border-edge px-3 py-2 text-sm text-fog hover:border-red-400/60 hover:text-red-300"
              >
                Remove
              </button>
            )}
            <button
              type="submit"
              disabled={pending}
              className="ml-auto rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-60"
            >
              {pending ? "Saving…" : existing ? "Save" : "Add to collection"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
