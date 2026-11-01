"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type AchievementCandidate,
  getSteamAchievementsForPicker,
  toggleBeatenAchievementVote,
} from "@/app/actions/beaten-achievements";
import { safeAction } from "@/lib/safe-action";

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function BeatenAchievementPicker({
  appId,
  igdbId,
  triggerLabel = "Pick beaten achievement",
  onPicked,
}: {
  appId: number;
  igdbId?: number | null;
  triggerLabel?: string;
  onPicked?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AchievementCandidate[] | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  async function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (items === null) {
      setLoading(true);
      setError(null);
      const res = await safeAction(() => getSteamAchievementsForPicker(appId, igdbId));
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setItems(res.achievements ?? []);
    }
  }

  function toggleVote(item: AchievementCandidate) {
    setError(null);
    startTransition(async () => {
      const res = await safeAction(() =>
        toggleBeatenAchievementVote({
          provider: "STEAM",
          externalGameId: String(appId),
          igdbId,
          achievementKey: item.key,
          title: item.title,
          description: item.description,
          iconUrl: item.iconUrl,
        })
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setItems((prev) =>
        prev
          ? prev.map((a) =>
              a.key === item.key
                ? {
                    ...a,
                    votedByMe: Boolean(res.voted),
                    voteCount: res.voteCount ?? a.voteCount,
                    confirmed: res.confirmed ?? a.confirmed,
                    activeForMe: Boolean(res.confirmed) || Boolean(res.voted),
                  }
                : a
            )
          : prev
      );
      onPicked?.();
      router.refresh();
    });
  }

  const q = filter.trim().toLowerCase();
  const visible = (items ?? []).filter(
    (a) =>
      !q ||
      a.title.toLowerCase().includes(q) ||
      (a.description && a.description.toLowerCase().includes(q)) ||
      a.key.toLowerCase().includes(q)
  );

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={toggleOpen}
        className="text-xs text-fog hover:text-white underline-offset-2 hover:underline"
      >
        {open ? "Close achievements" : triggerLabel}
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-edge bg-canvas p-3 text-left">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-fog">
              Optional: tick the achievement for finishing the main story and your copy counts as{" "}
              <span className="text-white">Beaten</span> on the day you unlocked it. We&apos;ll check it for everyone else.
            </p>
            {(items?.length ?? 0) > 5 && (
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter achievements…"
                aria-label="Filter achievements"
                className="rounded-md border border-edge bg-card px-2 py-1 text-xs text-white placeholder:text-fog/60"
              />
            )}
          </div>

          {loading && <p className="py-3 text-xs text-fog">Loading achievements…</p>}
          {error && <p className="py-2 text-xs text-red-400">{error}</p>}

          {!loading && items && items.length === 0 && (
            <p className="py-2 text-xs text-fog">No Steam achievements found for this game.</p>
          )}

          {!loading && visible.length > 0 && (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {visible.map((a) => {
                const isSelected = a.votedByMe || a.confirmed;
                return (
                  <li
                    key={a.key}
                    className={`flex items-start justify-between gap-3 rounded-lg border px-2.5 py-2 text-xs transition ${
                      a.activeForMe ? "border-mint/50 bg-mint/5" : "border-edge bg-card/60"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-white">{a.title}</span>
                        {a.confirmed && (
                          <span className="rounded bg-mint/20 px-1.5 py-0.5 text-[10px] font-medium text-mint">
                            Verified
                          </span>
                        )}

                        {!a.activeForMe && a.suggestedByHeuristic && (
                          <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] text-gold">
                            Likely story completion
                          </span>
                        )}
                        {a.unlockedAt && (
                          <span className="text-[11px] text-mint">
                            · Unlocked {formatShortDate(a.unlockedAt)}
                          </span>
                        )}
                      </div>
                      {a.description && <p className="mt-0.5 text-fog">{a.description}</p>}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggleVote(a)}
                      aria-pressed={a.votedByMe}
                      className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                        isSelected
                          ? "bg-mint text-canvas hover:brightness-110"
                          : "border border-edge bg-card text-fog hover:border-fog/50 hover:text-white"
                      }`}
                    >
                      {a.votedByMe ? "✓ Beaten achievement" : "Mark as beaten"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
