"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  COMPLETENESS,
  REGIONS,
  copyDetails,
  formatPrice,
  groupCollection,
  type CollectionEntry,
  type CollectionSort,
} from "@/lib/collection-shared";
import type { ModalGame, PlatformOption } from "@/lib/types";
import { CollectionItemForm } from "./CollectionItemForm";
import { Poster } from "./Poster";

const SORTS: { value: CollectionSort; label: string }[] = [
  { value: "platform", label: "By platform" },
  { value: "title", label: "A–Z" },
  { value: "added", label: "Recently added" },
];

const selectClass =
  "min-w-0 rounded-md border border-edge bg-card px-3 py-2 text-sm outline-none focus:border-mint/60";

type Editing = { game: ModalGame; existing?: CollectionEntry };

// The owner's collection: search to add, sort and filter, edit a copy.
export function Collection({ entries, platforms }: { entries: CollectionEntry[]; platforms: PlatformOption[] }) {
  const [sort, setSort] = useState<CollectionSort>("platform");
  const [region, setRegion] = useState("");
  const [completeness, setCompleteness] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);

  const shown = entries.filter(
    (e) => (!region || e.region === region) && (!completeness || e.completeness === completeness)
  );
  const groups = groupCollection(shown, sort);
  const platformCount = new Set(entries.map((e) => e.platformId)).size;
  const boxed = entries.filter((e) => e.completeness === "CIB" || e.completeness === "SEALED").length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Collection</h1>
        {entries.length > 0 && (
          <p className="text-sm text-fog">
            {entries.length} {entries.length === 1 ? "copy" : "copies"} · {platformCount}{" "}
            {platformCount === 1 ? "platform" : "platforms"}
            {boxed > 0 && ` · ${Math.round((boxed / entries.length) * 100)}% boxed`}
          </p>
        )}
      </div>
      <p className="mt-1 text-sm text-fog">
        The physical games you own. Separate from your diary: owning a game doesn&apos;t log it.{" "}
        <Link href="/settings#collection" className="text-mint hover:underline">
          Settings
        </Link>
      </p>

      <CollectionSearch onPick={(game) => setEditing({ game })} />

      {entries.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-edge bg-canvas p-0.5" role="group" aria-label="Sort">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                aria-pressed={sort === s.value}
                onClick={() => setSort(s.value)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                  sort === s.value ? "bg-card-2 text-white" : "text-fog hover:text-white"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <select aria-label="Filter by region" value={region} onChange={(e) => setRegion(e.target.value)} className={selectClass}>
            <option value="">Any region</option>
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by what you have"
            value={completeness}
            onChange={(e) => setCompleteness(e.target.value)}
            className={selectClass}
          >
            <option value="">Loose, boxed or sealed</option>
            {COMPLETENESS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-edge p-6 text-center text-sm text-fog">
          Nothing here yet. Search above to add the first game on your shelf.
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-8 text-sm text-fog">No copies match those filters.</p>
      ) : (
        groups.map((g) => (
          <section key={g.label || "all"} className="mt-6">
            {g.label && (
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fog">
                {g.label} · {g.entries.length}
              </h2>
            )}
            <ul className="divide-y divide-edge rounded-xl border border-edge bg-card">
              {g.entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 p-3">
                  <Link href={`/games/${e.igdbId}`} className="w-10 shrink-0">
                    <Poster name={e.name} coverUrl={e.coverUrl} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/games/${e.igdbId}`} className="font-medium hover:text-mint">
                      {e.name}
                    </Link>
                    <p className="text-xs text-fog">
                      {[sort === "platform" ? null : e.platformName, copyDetails(e) || null, formatPrice(e.pricePaid, e.currency)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing({ game: gameOf(e), existing: e })}
                    aria-label={`Edit your copy of ${e.name}`}
                    className="rounded-md border border-edge px-2.5 py-1 text-xs text-fog hover:border-fog/50 hover:text-white"
                  >
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {editing && (
        <CollectionItemForm
          game={editing.game}
          existing={editing.existing}
          platforms={platforms}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function gameOf(e: CollectionEntry): ModalGame {
  return { igdbId: e.igdbId, name: e.name, releaseYear: e.releaseYear, coverUrl: e.coverUrl, platformIds: e.platformIds };
}

function CollectionSearch({ onPick }: { onPick: (game: ModalGame) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ModalGame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/igdb/search?${new URLSearchParams({ q })}`, { signal: controller.signal });
        const data = (await res.json()) as { results?: ModalGame[]; error?: string };
        setError(res.ok ? null : (data.error ?? "Search failed"));
        setResults(res.ok ? (data.results ?? []).slice(0, 8) : []);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setError("Search failed");
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const shown = query.trim().length >= 2 ? results : [];

  return (
    <div className="mt-5">
      <input
        type="search"
        aria-label="Add a game to your collection"
        placeholder="Add a game you own…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border border-edge bg-card px-4 py-2.5 text-base outline-none placeholder:text-fog/70 focus:border-mint/60 focus:ring-1 focus:ring-mint/40"
      />
      {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
      {shown.length > 0 && (
        <ul className="mt-2 divide-y divide-edge rounded-lg border border-edge bg-card" aria-label="Search results">
          {shown.map((g) => (
            <li key={g.igdbId} className="flex items-center gap-3 p-2">
              <div className="w-9 shrink-0">
                <Poster name={g.name} coverUrl={g.coverUrl} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{g.name}</p>
                {g.releaseYear && <p className="text-xs text-fog/80">{g.releaseYear}</p>}
              </div>
              <button
                type="button"
                onClick={() => {
                  onPick(g);
                  setQuery("");
                }}
                aria-label={`Add ${g.name} to your collection`}
                className="rounded-md bg-mint px-3 py-1 text-xs font-semibold text-canvas hover:brightness-110"
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
