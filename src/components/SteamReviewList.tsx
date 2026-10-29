"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { importSteamGames, restoreSkippedSteamGames, skipSteamGames } from "@/app/actions/steam";
import { safeAction } from "@/lib/safe-action";
import { PLAY_STATUSES, STATUS_LABELS, STATUS_RANK, type PlayStatus } from "@/lib/status";
import { Poster } from "./Poster";
import { MatchSearch, type MatchedGame } from "./RaReviewList";

export type SteamReviewRow = {
  id: string;
  name: string;
  capsuleUrl: string;
  storeUrl: string;
  playtime: string;
  lastPlayed: string | null;
  achievements: string | null;
  complete: boolean;
  // Under an hour played: hidden unless asked for
  minor: boolean;
  proposed: PlayStatus;
  when: Record<PlayStatus, string>;
  match: MatchedGame | null;
};

// The server takes up to 300 per request.
const CHUNK = 100;

function effect(status: PlayStatus, existing: string | undefined): string {
  if (!existing) return "Adds a new diary entry";
  const finished = status === "BEATEN" || status === "MASTERED";
  if (STATUS_RANK[existing] >= STATUS_RANK[status] || !finished) {
    return `Already in your diary as ${STATUS_LABELS[existing as PlayStatus]} — will just link`;
  }
  return `Upgrades your ${STATUS_LABELS[existing as PlayStatus]} entry to ${STATUS_LABELS[status]}`;
}

export function SteamReviewList({
  rows: initialRows,
  diary,
  skipped,
}: {
  rows: SteamReviewRow[];
  diary: Record<number, string>;
  skipped: number;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, MatchedGame>>({});
  const [statuses, setStatuses] = useState<Record<string, PlayStatus>>({});
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [showMinor, setShowMinor] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const all = initialRows.map((r) => (overrides[r.id] ? { ...r, match: overrides[r.id] } : r));
  const minorCount = all.filter((r) => r.minor).length;
  const rows = all.filter((r) => showMinor || !r.minor);
  const statusOf = (r: SteamReviewRow) => statuses[r.id] ?? r.proposed;
  const include = (r: SteamReviewRow) => Boolean(r.match) && (ticks[r.id] ?? (!r.minor || Boolean(overrides[r.id])));
  const selected = rows.filter(include);

  function pick(id: string, game: MatchedGame) {
    setOverrides((o) => ({ ...o, [id]: game }));
    setTicks((t) => ({ ...t, [id]: true }));
    setEditing(null);
  }

  function setAll(on: boolean) {
    setTicks((t) => ({ ...t, ...Object.fromEntries(rows.filter((r) => r.match).map((r) => [r.id, on])) }));
  }

  function importSelected() {
    setError(null);
    setNotice(null);
    const selections = selected.map((r) => ({ id: r.id, igdbId: r.match!.igdbId, status: statusOf(r) }));
    startTransition(async () => {
      let imported = 0;
      let linked = 0;
      let failed = 0;
      for (let i = 0; i < selections.length; i += CHUNK) {
        if (selections.length > CHUNK) setProgress(`Importing ${i + 1}–${Math.min(i + CHUNK, selections.length)} of ${selections.length}…`);
        const result = await safeAction(() => importSteamGames(selections.slice(i, i + CHUNK)));
        if (!result.ok) {
          setProgress(null);
          setError(result.error);
          router.refresh();
          return;
        }
        imported += result.imported ?? 0;
        linked += result.linked ?? 0;
        failed += result.failed ?? 0;
      }
      setProgress(null);
      const parts = [`Imported ${imported}`];
      if (linked) parts.push(`linked ${linked} already in your diary`);
      if (failed) parts.push(`${failed} couldn't be looked up — try again later`);
      setNotice(parts.join(", ") + ".");
      router.refresh();
    });
  }

  function skip(ids: string[]) {
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() => skipSteamGames(ids));
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  function restore() {
    startTransition(async () => {
      const result = await safeAction(() => restoreSkippedSteamGames());
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  const unmatched = rows.filter((r) => !r.match);

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
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-fog">
            <button type="button" onClick={() => setAll(true)} className="hover:text-white">
              Tick all
            </button>
            <button type="button" onClick={() => setAll(false)} className="hover:text-white">
              Untick all
            </button>
            {unmatched.length > 0 && (
              <button type="button" onClick={() => skip(unmatched.map((r) => r.id))} disabled={busy} className="hover:text-white disabled:opacity-50">
                Skip the {unmatched.length} not found
              </button>
            )}
          </div>
          <ul className="space-y-3">
            {rows.map((r) => {
              const status = statusOf(r);
              return (
                <li key={r.id} className="rounded-xl border border-edge bg-card p-4" data-steam-row={r.name}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={include(r)}
                      disabled={!r.match}
                      onChange={(e) => setTicks((t) => ({ ...t, [r.id]: e.target.checked }))}
                      aria-label={`Import ${r.name}`}
                      className="mt-1 h-4 w-4 accent-[var(--color-mint)]"
                    />
                    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.capsuleUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          onError={(e) => (e.currentTarget.style.display = "none")}
                          className="mb-2 h-[46px] w-[123px] rounded object-cover"
                        />
                        <a href={r.storeUrl} target="_blank" rel="noopener noreferrer" className="break-words font-medium hover:text-mint">
                          {r.name}
                        </a>
                        <p className="text-xs text-fog">
                          {r.playtime}
                          {r.lastPlayed && ` · last played ${r.lastPlayed}`}
                          {r.achievements && (
                            <span className={r.complete ? "text-gold" : undefined}> · {r.achievements} achievements</span>
                          )}
                        </p>
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
                              <label className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fog">
                                <span className="sr-only">Status for {r.name}</span>
                                <select
                                  value={status}
                                  onChange={(e) => setStatuses((s) => ({ ...s, [r.id]: e.target.value as PlayStatus }))}
                                  className="rounded-md border border-edge bg-canvas px-2 py-1 text-xs text-white"
                                >
                                  {PLAY_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {STATUS_LABELS[s]}
                                      {s === r.proposed ? " (suggested)" : ""}
                                    </option>
                                  ))}
                                </select>
                                <span>{r.when[status]}</span>
                              </label>
                              <p className="mt-1 text-xs text-fog">{effect(status, overrides[r.id] ? undefined : diary[r.match.igdbId])}</p>
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-fog">Not found in the game database (it may be software or a demo).</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end gap-3 text-xs">
                    <button type="button" onClick={() => setEditing(editing === r.id ? null : r.id)} className="text-fog hover:text-white">
                      {r.match ? "Change match" : "Find the game"}
                    </button>
                    <button type="button" onClick={() => skip([r.id])} disabled={busy} className="text-fog hover:text-white disabled:opacity-50">
                      Skip
                    </button>
                  </div>
                  {editing === r.id && <MatchSearch initial={r.name} onPick={(g) => pick(r.id, g)} />}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {minorCount > 0 && (
        <p className="mt-4 text-xs text-fog">
          <button type="button" onClick={() => setShowMinor((v) => !v)} className="underline hover:text-white">
            {showMinor ? "Hide" : "Show"} {minorCount} game{minorCount === 1 ? "" : "s"} played for under an hour
          </button>
        </p>
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
          <span className="text-xs text-fog">{progress ?? "Unticked games stay here for later."}</span>
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
