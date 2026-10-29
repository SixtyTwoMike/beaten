"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  importRetroAchievements,
  restoreSkippedRetroAchievements,
  skipRetroAchievements,
} from "@/app/actions/retroachievements";
import { safeAction } from "@/lib/safe-action";
import { STATUS_LABELS, STATUS_RANK, type PlayStatus } from "@/lib/status";
import { Poster } from "./Poster";
import { StatusBadge } from "./StatusBadge";

export type MatchedGame = { igdbId: number; name: string; coverUrl: string | null; year: number | null };

export type RaReviewRow = {
  key: string;
  awardIds: string[];
  title: string;
  consoleName: string | null;
  kind: "BEATEN" | "MASTERED";
  hardcore: boolean;
  date: string;
  iconUrl: string | null;
  raUrl: string;
  confidence: "HIGH" | "LOW" | "NONE";
  match: MatchedGame | null;
};


// What importing this row will do to the diary.
function effect(kind: string, existing: string | undefined): string {
  if (!existing) return "Adds a new diary entry";
  if (STATUS_RANK[existing] >= STATUS_RANK[kind]) return `Already logged as ${STATUS_LABELS[existing as PlayStatus]} — will just link`;
  return `Upgrades your ${STATUS_LABELS[existing as PlayStatus]} entry to ${STATUS_LABELS[kind as PlayStatus]}`;
}

export function MatchSearch({ initial, onPick }: { initial: string; onPick: (g: MatchedGame) => void }) {
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState<MatchedGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/igdb/search?${new URLSearchParams({ q: q.trim() })}`);
      const data = (await res.json()) as {
        results?: { igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null }[];
      };
      if (!res.ok) throw new Error();
      setResults((data.results ?? []).slice(0, 8).map((g) => ({ igdbId: g.igdbId, name: g.name, coverUrl: g.coverUrl, year: g.releaseYear })));
    } catch {
      setError("Search failed — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-edge bg-canvas p-3">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search for the right game"
          className="flex-1 rounded-md border border-edge bg-card px-3 py-1.5 text-sm outline-none focus:border-mint/60"
        />
        <button type="submit" disabled={busy} className="rounded-md border border-edge px-3 py-1.5 text-sm text-fog hover:text-white disabled:opacity-50">
          {busy ? "…" : "Search"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {results && results.length === 0 && <p className="mt-2 text-xs text-fog">No games found.</p>}
      {results && results.length > 0 && (
        <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {results.map((g) => (
            <li key={g.igdbId}>
              <button type="button" onClick={() => onPick(g)} title={`${g.name}${g.year ? ` (${g.year})` : ""}`} className="block w-full hover:opacity-80">
                <Poster name={g.name} coverUrl={g.coverUrl} />
                <span className="mt-1 block truncate text-[11px] text-fog">{g.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RaReviewList({
  rows: initialRows,
  diary,
  skipped,
}: {
  rows: RaReviewRow[];
  diary: Record<number, string>;
  skipped: number;
}) {
  const router = useRouter();
  // Rows come fresh from the server after every change; only the user's
  // choices (ticks, re-picked games) live here, keyed by row.
  const [overrides, setOverrides] = useState<Record<string, MatchedGame>>({});
  const [ticks, setInclude] = useState<Record<string, boolean>>({});
  const rows = initialRows.map((r) => (overrides[r.key] ? { ...r, match: overrides[r.key] } : r));
  const picked: Record<string, boolean> = Object.fromEntries(Object.keys(overrides).map((k) => [k, true]));
  const include = (r: RaReviewRow) =>
    Boolean(r.match) && (ticks[r.key] ?? (r.confidence === "HIGH" || Boolean(picked[r.key])));
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const selected = rows.filter(include);

  function pick(key: string, game: MatchedGame) {
    setOverrides((o) => ({ ...o, [key]: game }));
    setInclude((i) => ({ ...i, [key]: true }));
    setEditing(null);
  }

  function importSelected() {
    setError(null);
    setNotice(null);
    const selections = selected.flatMap((r) => r.awardIds.map((awardId) => ({ awardId, igdbId: r.match!.igdbId })));
    startTransition(async () => {
      const result = await safeAction(() => importRetroAchievements(selections));
      if (!result.ok) return setError(result.error);
      const parts = [`Imported ${result.imported ?? 0}`];
      if (result.linked) parts.push(`linked ${result.linked} already in your diary`);
      if (result.failed) parts.push(`${result.failed} couldn't be looked up — try again later`);
      setNotice(parts.join(", ") + ".");
      router.refresh();
    });
  }

  function skip(row: RaReviewRow) {
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() => skipRetroAchievements(row.awardIds));
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  function restore() {
    startTransition(async () => {
      const result = await safeAction(() => restoreSkippedRetroAchievements());
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  const confidenceLabel = (r: RaReviewRow) =>
    picked[r.key]
      ? { text: "Your pick", cls: "bg-mint/15 text-mint" }
      : r.confidence === "HIGH"
        ? { text: "Confident match", cls: "bg-mint/15 text-mint" }
        : r.confidence === "LOW"
          ? { text: "Check this", cls: "bg-gold/15 text-gold" }
          : { text: "No match", cls: "bg-card-2 text-fog" };

  return (
    <div>
      {notice && <p className="mb-4 rounded-md bg-mint/10 px-3 py-2 text-sm text-mint">{notice}</p>}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-edge bg-card/50 p-8 text-center text-sm text-fog">
          Nothing waiting to import.{" "}
          <Link href="/log" className="text-mint hover:underline">
            See your diary →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const label = confidenceLabel(r);
            return (
              <li key={r.key} className="rounded-xl border border-edge bg-card p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={include(r)}
                    disabled={!r.match}
                    onChange={(e) => setInclude((i) => ({ ...i, [r.key]: e.target.checked }))}
                    aria-label={`Import ${r.title}`}
                    className="mt-1 h-4 w-4 accent-[var(--color-mint)]"
                  />
                  <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                    <div className="flex min-w-0 gap-3">
                      {r.iconUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.iconUrl} alt="" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded" />
                      )}
                      <div className="min-w-0">
                        <a href={r.raUrl} target="_blank" rel="noopener noreferrer" className="break-words font-medium hover:text-mint">
                          {r.title}
                        </a>
                        <p className="text-xs text-fog">
                          {r.consoleName}
                          {r.consoleName && " · "}
                          {r.date}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={r.kind} />
                          {r.hardcore && <span className="rounded-full bg-card-2 px-2 py-0.5 text-xs text-fog">Hardcore</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex min-w-0 gap-3">
                      {r.match ? (
                        <>
                          <div className="w-10 shrink-0">
                            <Poster name={r.match.name} coverUrl={r.match.coverUrl} />
                          </div>
                          <div className="min-w-0">
                            <p className="break-words text-sm font-medium">
                              {r.match.name}
                              {r.match.year && <span className="ml-1 font-normal text-fog">{r.match.year}</span>}
                            </p>
                            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${label.cls}`}>{label.text}</span>
                            <p className="mt-1 text-xs text-fog">{effect(r.kind, picked[r.key] ? undefined : diary[r.match.igdbId])}</p>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-fog">
                          No matching game found{/^~/.test(r.title) || /\[Subset/i.test(r.title) ? " (hacks and subsets aren't matched)" : ""}.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex justify-end gap-3 text-xs">
                  <button type="button" onClick={() => setEditing(editing === r.key ? null : r.key)} className="text-fog hover:text-white">
                    {r.match ? "Change match" : "Find the game"}
                  </button>
                  <button type="button" onClick={() => skip(r)} disabled={busy} className="text-fog hover:text-white disabled:opacity-50">
                    Skip
                  </button>
                </div>
                {editing === r.key && (
                  <MatchSearch initial={r.title.replace(/^~[^~]+~\s*/, "").replace(/\[[^\]]*\]/g, "").trim()} onPick={(g) => pick(r.key, g)} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > 0 && (
        <div className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-3 border-t border-edge bg-canvas/95 py-3 backdrop-blur">
          <button
            type="button"
            onClick={importSelected}
            disabled={busy || selected.length === 0}
            className="rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50 transition"
          >
            {busy ? "Importing…" : `Import ${selected.length} game${selected.length === 1 ? "" : "s"}`}
          </button>
          <span className="text-xs text-fog">Unticked games stay here for later.</span>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
      {skipped > 0 && (
        <p className="mt-4 text-xs text-fog">
          {skipped} skipped.{" "}
          <button type="button" onClick={restore} disabled={busy} className="underline hover:text-white">
            Bring them back
          </button>
        </p>
      )}
    </div>
  );
}
