"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearAvatar, setAvatar } from "@/app/actions/profile";
import { MAX_ZOOM, MIN_ZOOM, avatarLayout, clamp, type AvatarSource } from "@/lib/avatar";
import { Avatar } from "./Avatar";
import { safeAction } from "@/lib/safe-action";

export type AvatarGame = {
  gameId: string;
  name: string;
  coverUrl: string | null;
  artworkUrl: string | null;
};

type Crop = { gameId: string; source: AvatarSource; x: number; y: number; zoom: number };

const PREVIEW = 208;

export function AvatarPicker({
  games,
  current,
  displayName,
}: {
  games: AvatarGame[];
  current: Crop | null;
  displayName: string;
}) {
  const router = useRouter();
  const [crop, setCrop] = useState<Crop | null>(current);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const drag = useRef<{ px: number; py: number } | null>(null);

  const game = crop ? games.find((g) => g.gameId === crop.gameId) : undefined;
  const url = game && crop ? (crop.source === "cover" ? game.coverUrl : game.artworkUrl) : null;
  const avatar = crop && url ? { url, source: crop.source, x: crop.x, y: crop.y, zoom: crop.zoom } : null;
  const dirty = JSON.stringify(crop) !== JSON.stringify(current);

  function pick(g: AvatarGame) {
    setSaved(false);
    setCrop({ gameId: g.gameId, source: g.artworkUrl && !g.coverUrl ? "artwork" : "cover", x: 50, y: 30, zoom: 1.2 });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!crop) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !crop) return;
    const dx = e.clientX - drag.current.px;
    const dy = e.clientY - drag.current.py;
    drag.current = { px: e.clientX, py: e.clientY };
    const l = avatarLayout(PREVIEW, crop);
    const spareX = PREVIEW - l.width; // ≤ 0 when the image overflows
    const spareY = PREVIEW - l.height;
    setSaved(false);
    setCrop({
      ...crop,
      x: spareX < 0 ? clamp(crop.x + (dx / spareX) * 100, 0, 100) : 50,
      y: spareY < 0 ? clamp(crop.y + (dy / spareY) * 100, 0, 100) : 50,
    });
  }

  function save() {
    if (!crop) return;
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() => setAvatar(crop));
      if (!result.ok) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() => clearAvatar());
      if (!result.ok) return setError(result.error);
      setCrop(null);
      setSaved(false);
      router.refresh();
    });
  }

  if (games.length === 0) {
    return (
      <p className="text-sm text-fog">
        Once you&apos;ve logged a game as beaten or mastered, you can use its art
        as your picture.
      </p>
    );
  }

  const shown = games.filter((g) => g.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5">
        <div
          className={`touch-none rounded-full ring-2 ring-white/15 ${crop ? "cursor-grab active:cursor-grabbing" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          data-testid="avatar-crop"
        >
          <Avatar avatar={avatar} name={displayName} size={PREVIEW} />
        </div>
        <div className="w-full space-y-3 sm:pt-2">
          {game ? (
            <>
              <p className="text-sm">
                <span className="text-fog">From </span>
                <span className="font-medium text-white">{game.name}</span>
              </p>
              <div className="flex gap-2 text-xs" role="group" aria-label="Image">
                {(["cover", "artwork"] as const).map((src) => {
                  const available = src === "cover" ? game.coverUrl : game.artworkUrl;
                  return (
                    <button
                      key={src}
                      type="button"
                      disabled={!available}
                      aria-pressed={crop?.source === src}
                      onClick={() => crop && setCrop({ ...crop, source: src, x: 50, y: 40 })}
                      className="rounded-full border border-edge px-3 py-1 capitalize text-fog aria-pressed:border-mint/60 aria-pressed:bg-mint/10 aria-pressed:text-white disabled:opacity-40"
                    >
                      {src}
                    </button>
                  );
                })}
              </div>
              <label className="block text-xs text-fog">
                Zoom
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={crop?.zoom ?? 1}
                  onChange={(e) => crop && setCrop({ ...crop, zoom: Number(e.target.value) })}
                  className="mt-1 block w-full accent-[var(--color-mint)]"
                />
              </label>
              <p className="text-xs text-fog/85">Drag the picture to reposition it.</p>
            </>
          ) : (
            <p className="text-sm text-fog">Pick a game below to use its art.</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!crop || !dirty || pending}
              className="rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50 transition"
            >
              {pending ? "Saving…" : "Save picture"}
            </button>
            {current && (
              <button type="button" onClick={remove} disabled={pending} className="text-sm text-fog hover:text-white">
                Remove
              </button>
            )}
            {saved && <p className="text-sm text-mint">Saved.</p>}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>

      <div>
        {games.length > 12 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter your games"
            aria-label="Filter your games"
            className="mb-2 w-full rounded-md border border-edge bg-canvas px-3 py-1.5 text-sm outline-none focus:border-mint/60"
          />
        )}
        <ul className="grid max-h-64 grid-cols-5 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
          {shown.map((g) => (
            <li key={g.gameId}>
              <button
                type="button"
                onClick={() => pick(g)}
                aria-pressed={crop?.gameId === g.gameId}
                title={g.name}
                className="block w-full overflow-hidden rounded-md ring-2 ring-transparent transition hover:opacity-80 aria-pressed:ring-mint"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={(g.coverUrl ?? g.artworkUrl)!}
                  alt={g.name}
                  className="aspect-[3/4] w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
