"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addToPullList, importSteamWishlist, removeFromPullList, reorderPullList } from "@/app/actions/pull-list";
import { formatDate } from "@/lib/format";
import { PULL_SORTS, pullGenres, releaseState, sortPullList, type PullEntry, type PullSort } from "@/lib/pull-sort";
import { safeAction } from "@/lib/safe-action";
import type { ModalGame } from "@/lib/types";
import { Poster } from "./Poster";

// The Pull List: games you're interested in. Sorted in the browser; in "My
// order" (with no genre filter) games can be dragged or moved with the
// arrow buttons, and the new order is saved straight away.

const chip =
  "rounded-full border border-edge px-3 py-1 text-xs text-fog aria-pressed:border-mint/60 aria-pressed:bg-mint/10 aria-pressed:text-white";

export function PullList({ entries, steamLinked, initialSort }: { entries: PullEntry[]; steamLinked: boolean; initialSort: PullSort }) {
  const router = useRouter();
  const [list, setList] = useState(entries);
  const [sort, setSort] = useState<PullSort>(initialSort);
  const [genre, setGenre] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [syncing, startSync] = useTransition();

  // A fresh server copy (after adding, syncing or router.refresh()).
  const [served, setServed] = useState(entries);
  if (entries !== served) {
    setServed(entries);
    setList(entries);
  }

  // The sort is kept in the address (?sort=), so it survives a reload.
  function chooseSort(s: PullSort) {
    setSort(s);
    router.replace(s === "order" ? "/pull-list" : `/pull-list?sort=${s}`, { scroll: false });
  }

  const genres = useMemo(() => pullGenres(list), [list]);
  const activeGenre = genre && genres.includes(genre) ? genre : null;
  const groups = sortPullList(list, sort, activeGenre);
  const canReorder = sort === "order" && !activeGenre;

  async function saveOrder(next: PullEntry[]) {
    const previous = list;
    setList(next);
    setError(null);
    const r = await safeAction(() => reorderPullList(next.map((e) => e.igdbId)));
    if (!r.ok) {
      setList(previous);
      setError(r.error);
    }
  }

  function move(igdbId: number, to: number) {
    const from = list.findIndex((e) => e.igdbId === igdbId);
    if (from < 0 || to < 0 || to >= list.length || from === to) return;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    saveOrder(next);
  }

  async function remove(entry: PullEntry) {
    const previous = list;
    setList(list.filter((e) => e.igdbId !== entry.igdbId));
    setError(null);
    const r = await safeAction(() => removeFromPullList(entry.igdbId));
    if (!r.ok) {
      setList(previous);
      setError(r.error);
    }
  }

  function syncWishlist() {
    setError(null);
    setNotice(null);
    startSync(async () => {
      const r = await safeAction(() => importSteamWishlist());
      if (!r.ok) return setError(r.error);
      setNotice(
        r.empty
          ? "Your Steam wishlist came back empty. If it isn't, set it to public in Steam's privacy settings."
          : `${r.added ? `Added ${r.added} game${r.added === 1 ? "" : "s"}` : "Nothing new"} from your wishlist` +
              (r.unmatched ? ` · ${r.unmatched} we couldn't match` : "")
      );
      router.refresh();
    });
  }

  const onList = new Set(list.map((e) => e.igdbId));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pull List</h1>
          <p className="mt-1 text-sm text-fog">
            Games you&apos;re interested in, in your order. They leave the list when you log them.
          </p>
        </div>
        {steamLinked ? (
          <button
            type="button"
            onClick={syncWishlist}
            disabled={syncing}
            className="rounded-md border border-edge px-3 py-1.5 text-sm text-fog hover:text-white disabled:opacity-50"
          >
            {syncing ? "Checking Steam…" : "Bring in my Steam wishlist"}
          </button>
        ) : (
          <Link href="/settings#steam" className="text-sm text-mint hover:underline">
            Link Steam to bring in your wishlist
          </Link>
        )}
      </div>

      <PullSearch onList={onList} onAdded={() => router.refresh()} />

      {notice && <p role="status" className="mt-3 text-sm text-mint">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}

      {list.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-edge bg-card/50 p-10 text-center text-fog">
          Nothing here yet. Search above to add games you&apos;ve got your eye on.
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Sort by">
              {(Object.keys(PULL_SORTS) as PullSort[]).map((s) => (
                <button key={s} type="button" aria-pressed={sort === s} onClick={() => chooseSort(s)} className={chip}>
                  {PULL_SORTS[s]}
                </button>
              ))}
            </div>
            {genres.length > 0 && (
              <select
                aria-label="Genre"
                value={activeGenre ?? ""}
                onChange={(e) => setGenre(e.target.value || null)}
                className="rounded-md border border-edge bg-card px-2 py-1 text-xs text-fog"
              >
                <option value="">All genres</option>
                {genres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}
          </div>

          {groups.length === 0 && <p className="mt-6 text-sm text-fog">No games in that genre.</p>}
          {groups.map((group) => (
            <section key={group.title ?? "all"} className="mt-6">
              {group.title && (
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fog">
                  {group.title} <span className="font-normal normal-case text-fog/70">· {group.entries.length}</span>
                </h2>
              )}
              <ol className="divide-y divide-edge overflow-hidden rounded-xl border border-edge bg-card">
                {group.entries.map((entry) => {
                  const index = list.indexOf(entry);
                  return (
                    <li
                      key={entry.igdbId}
                      draggable={canReorder}
                      onDragStart={() => setDragging(entry.igdbId)}
                      onDragEnd={() => setDragging(null)}
                      onDragOver={(e) => canReorder && dragging !== null && e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragging !== null) move(dragging, index);
                        setDragging(null);
                      }}
                      className={`flex items-center gap-3 p-3 ${dragging === entry.igdbId ? "opacity-40" : ""} ${canReorder ? "cursor-grab" : ""}`}
                    >
                      {canReorder && <span className="w-6 shrink-0 text-right text-sm tabular-nums text-fog/70">{index + 1}</span>}
                      <Link href={`/games/${entry.igdbId}`} className="w-12 shrink-0">
                        <Poster name={entry.name} coverUrl={entry.coverUrl} />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/games/${entry.igdbId}`} className="line-clamp-2 font-medium leading-snug hover:text-mint">
                          {entry.name}
                        </Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fog/85">
                          <ReleaseBadge entry={entry} />
                          {entry.genres.length > 0 && <span className="truncate">{entry.genres.slice(0, 3).join(", ")}</span>}
                          {entry.source === "STEAM" && <span className="text-fog/60">from Steam wishlist</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {canReorder && (
                          <>
                            <IconButton label={`Move ${entry.name} up`} disabled={index === 0} onClick={() => move(entry.igdbId, index - 1)}>
                              ↑
                            </IconButton>
                            <IconButton
                              label={`Move ${entry.name} down`}
                              disabled={index === list.length - 1}
                              onClick={() => move(entry.igdbId, index + 1)}
                            >
                              ↓
                            </IconButton>
                          </>
                        )}
                        <IconButton label={`Remove ${entry.name} from your Pull List`} onClick={() => remove(entry)}>
                          ×
                        </IconButton>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function ReleaseBadge({ entry }: { entry: PullEntry }) {
  const state = releaseState(entry);
  if (state === "tba") return <span className="rounded bg-edge/60 px-1.5 py-0.5 text-fog">TBA</span>;
  if (state === "upcoming") return <span className="rounded bg-gold/15 px-1.5 py-0.5 text-gold">Out {formatDate(entry.releaseDate)}</span>;
  return <span>{formatDate(entry.releaseDate)}</span>;
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-md text-fog hover:bg-edge/60 hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}

// Game search, as on the Search page, with an Add button on each result.
function PullSearch({ onList, onAdded }: { onList: Set<number>; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ModalGame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());
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

  async function add(game: ModalGame) {
    setAdding(game.igdbId);
    setError(null);
    const r = await safeAction(() => addToPullList(game.igdbId));
    setAdding(null);
    if (!r.ok) return setError(r.error);
    setAdded((s) => new Set(s).add(game.igdbId));
    onAdded();
  }

  const shown = query.trim().length >= 2 ? results : [];

  return (
    <div className="mt-5">
      <input
        type="search"
        aria-label="Add a game to your Pull List"
        placeholder="Add a game…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border border-edge bg-card px-4 py-2.5 text-base outline-none placeholder:text-fog/70 focus:border-mint/60 focus:ring-1 focus:ring-mint/40"
      />
      {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
      {shown.length > 0 && (
        <ul className="mt-2 divide-y divide-edge rounded-lg border border-edge bg-card" aria-label="Search results">
          {shown.map((g) => {
            const have = onList.has(g.igdbId) || added.has(g.igdbId);
            return (
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
                  onClick={() => add(g)}
                  disabled={have || adding === g.igdbId}
                  aria-label={have ? `${g.name} is on your Pull List` : `Add ${g.name} to your Pull List`}
                  className="rounded-md bg-mint px-3 py-1 text-xs font-semibold text-canvas hover:brightness-110 disabled:bg-edge disabled:text-fog"
                >
                  {have ? "On list" : adding === g.igdbId ? "Adding…" : "Add"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
