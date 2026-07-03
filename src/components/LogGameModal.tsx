"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLog } from "@/app/actions/logs";
import { todayDateInput } from "@/lib/format";
import type {
  ExistingLog,
  ModalGame,
  PlatformOption,
  ShelfOption,
} from "@/lib/types";
import { Poster } from "./Poster";
import { StarRatingInput } from "./StarRatingInput";

const fieldClass =
  "w-full rounded-md border border-edge bg-canvas px-3 py-2 text-sm outline-none focus:border-mint/60 focus:ring-1 focus:ring-mint/40";

const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-fog";

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; activeClass: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md border border-edge bg-canvas p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition ${
            value === o.value ? o.activeClass : "text-fog hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LogGameModal({
  game,
  platforms,
  shelves,
  existing,
  defaultStatus = "BEATEN",
  onClose,
}: {
  game: ModalGame;
  platforms: PlatformOption[];
  shelves: ShelfOption[];
  existing?: ExistingLog | null;
  defaultStatus?: "BEATEN" | "MASTERED";
  onClose: () => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"BEATEN" | "MASTERED">(
    existing?.status === "MASTERED" ? "MASTERED" : existing ? "BEATEN" : defaultStatus
  );
  const [platformId, setPlatformId] = useState<string>(
    existing?.platformId ? String(existing.platformId) : ""
  );
  const [startedAt, setStartedAt] = useState(existing?.startedAt ?? "");
  const [finishedAt, setFinishedAt] = useState(
    existing?.finishedAt ?? todayDateInput()
  );
  const [isReplay, setIsReplay] = useState<"first" | "replay">(
    existing?.isReplay ? "replay" : "first"
  );
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [reviewText, setReviewText] = useState(existing?.reviewText ?? "");
  const [selectedShelves, setSelectedShelves] = useState<string[]>([]);
  const [newShelfName, setNewShelfName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const gamePlatforms = platforms.filter((p) =>
    game.platformIds.includes(p.id)
  );
  const otherPlatforms = platforms.filter(
    (p) => !game.platformIds.includes(p.id)
  );

  function toggleShelf(id: string) {
    setSelectedShelves((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveLog({
        logId: existing?.logId,
        igdbId: game.igdbId,
        status,
        platformId: platformId ? Number(platformId) : null,
        startedAt: startedAt || null,
        finishedAt,
        isReplay: isReplay === "replay",
        rating: rating || null,
        reviewText: reviewText || null,
        shelfIds: selectedShelves,
        newShelfName: newShelfName || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-edge bg-card shadow-2xl">
        <div className="flex items-center gap-4 border-b border-edge p-4">
          <div className="w-12 shrink-0">
            <Poster name={game.name} coverUrl={game.coverUrl} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {game.name}
              {game.releaseYear && (
                <span className="ml-2 font-normal text-fog">
                  {game.releaseYear}
                </span>
              )}
            </p>
            <p className="text-sm text-fog">
              {existing ? "Edit log entry" : "Add to your played log"}
            </p>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className={labelClass}>Status</span>
              <Segmented
                value={status}
                onChange={setStatus}
                options={[
                  {
                    value: "BEATEN",
                    label: "Beaten",
                    activeClass: "bg-mint text-canvas",
                  },
                  {
                    value: "MASTERED",
                    label: "Mastered ★",
                    activeClass: "bg-gold text-canvas",
                  },
                ]}
              />
            </div>
            <div>
              <span className={labelClass}>Play</span>
              <Segmented
                value={isReplay}
                onChange={setIsReplay}
                options={[
                  {
                    value: "first",
                    label: "First time",
                    activeClass: "bg-card-2 text-white",
                  },
                  {
                    value: "replay",
                    label: "Replay",
                    activeClass: "bg-card-2 text-white",
                  },
                ]}
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="log-platform">
              Platform
            </label>
            <select
              id="log-platform"
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value)}
              className={fieldClass}
            >
              <option value="">— Not specified —</option>
              {gamePlatforms.length > 0 && (
                <optgroup label="This game's platforms">
                  {gamePlatforms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={gamePlatforms.length ? "All platforms" : "Platforms"}>
                {otherPlatforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="log-started">
                Started <span className="normal-case text-fog/60">(optional)</span>
              </label>
              <input
                id="log-started"
                type="date"
                value={startedAt}
                max={finishedAt || undefined}
                onChange={(e) => setStartedAt(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="log-finished">
                Finished
              </label>
              <input
                id="log-finished"
                type="date"
                required
                value={finishedAt}
                onChange={(e) => setFinishedAt(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <span className={labelClass}>Rating</span>
            <StarRatingInput value={rating} onChange={setRating} />
          </div>

          <div>
            <label className={labelClass} htmlFor="log-review">
              Review <span className="normal-case text-fog/60">(optional)</span>
            </label>
            <textarea
              id="log-review"
              rows={4}
              placeholder="What did you think?"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              className={fieldClass}
            />
          </div>

          {!existing && (
            <div>
              <span className={labelClass}>Add to shelves</span>
              <div className="space-y-1.5">
                {shelves.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedShelves.includes(s.id)}
                      onChange={() => toggleShelf(s.id)}
                      className="h-4 w-4 accent-[#00d474]"
                    />
                    {s.name}
                  </label>
                ))}
                <input
                  type="text"
                  placeholder="+ New shelf name"
                  value={newShelfName}
                  onChange={(e) => setNewShelfName(e.target.value)}
                  className={`${fieldClass} mt-1`}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-edge px-4 py-2 text-sm text-fog hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50"
            >
              {pending ? "Saving…" : existing ? "Save changes" : "Save log"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
