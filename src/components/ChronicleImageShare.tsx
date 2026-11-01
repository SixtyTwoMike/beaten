"use client";

import { useEffect, useState } from "react";
import { CHRONICLE_PICKS, DEFAULT_CHRONICLE_CARD, type ChronicleCardOptions, type ChroniclePick } from "@/lib/cards/chronicle-card-markup";
import { renderCardSvg, svgToPng, svgUrl } from "@/lib/cards/render-client";
import type { ChronicleView } from "@/lib/chronicle-core";
import { CARD_ACCENTS, CARD_FORMATS, type CardAccent, type CardFormat } from "@/lib/share-card";

// Console Chronicles as an image, in the share card's style, drawn on this
// device (a Web Worker lays it out; lib/cards). Preview updates as options
// change; Save shares it on phones and downloads it elsewhere.

const chip =
  "rounded-full border border-edge px-3 py-1 text-xs text-fog aria-pressed:border-mint/60 aria-pressed:bg-mint/10 aria-pressed:text-white disabled:opacity-50";

export function ChronicleImageShare({ view }: { view: ChronicleView }) {
  const [opts, setOpts] = useState<ChronicleCardOptions>(DEFAULT_CHRONICLE_CARD);
  const [card, setCard] = useState<{ svg: string; url: string; width: number; height: number; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const key = JSON.stringify([opts, view]);
  const loading = card?.key !== key;
  const set = <K extends keyof ChronicleCardOptions>(k: K, v: ChronicleCardOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await renderCardSvg({ kind: "chronicle", data: view, opts });
        if (cancelled) return;
        setError(null);
        setCard((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { ...r, url: svgUrl(r.svg), key };
        });
      } catch (e) {
        console.error("chronicle card failed:", e);
        if (!cancelled) setError("Couldn't draw the image on this device.");
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // key stands for opts and view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function save() {
    if (!card) return;
    setSaving(true);
    try {
      const file = await svgToPng(card.svg, card.width, card.height, `console-chronicles-${opts.format}`);
      if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
        await navigator.share({ files: [file], title: "My Console Chronicles" }).catch(() => {});
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      }
    } catch (e) {
      console.error("chronicle card PNG failed:", e);
      setError("Couldn't save the image on this device.");
    } finally {
      setSaving(false);
    }
  }

  const { width, height } = CARD_FORMATS[opts.format];
  const accent = opts.accent ?? view.accent;

  return (
    <div className="space-y-3">
      <div
        className="relative w-full overflow-hidden rounded-lg border border-edge bg-canvas"
        style={{ aspectRatio: `${width} / ${height}`, maxWidth: opts.format === "story" ? 280 : 480 }}
      >
        {card && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.url} alt="Preview of your Console Chronicles image" className={`h-full w-full object-contain transition-opacity ${loading ? "opacity-40" : ""}`} />
        )}
        {loading && (
          <div role="status" className="absolute inset-0 flex items-center justify-center">
            <span className="flex items-center gap-2 rounded-full bg-canvas/85 px-3 py-1.5 text-xs text-fog">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-fog/40 border-t-mint" aria-hidden />
              Drawing…
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Image format">
        {(Object.keys(CARD_FORMATS) as CardFormat[]).map((f) => (
          <button key={f} type="button" aria-pressed={opts.format === f} onClick={() => set("format", f)} className={chip}>
            {CARD_FORMATS[f].label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Which consoles">
        {(Object.keys(CHRONICLE_PICKS) as ChroniclePick[]).map((p) => (
          <button key={p} type="button" aria-pressed={opts.pick === p} onClick={() => set("pick", p)} className={chip}>
            {CHRONICLE_PICKS[p]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Image colour">
        {(Object.keys(CARD_ACCENTS) as CardAccent[]).map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={accent === a}
            aria-label={a}
            title={a}
            onClick={() => set("accent", a)}
            className="h-6 w-6 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-card aria-pressed:ring-white"
            style={{ backgroundColor: CARD_ACCENTS[a] }}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-edge" />
        <button type="button" aria-pressed={opts.games} onClick={() => set("games", !opts.games)} className={chip}>
          Games
        </button>
        {view.showAges && (
          <button type="button" aria-pressed={opts.ages} onClick={() => set("ages", !opts.ages)} className={chip}>
            Ages
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={save}
        disabled={!card || loading || saving}
        className="rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50 transition"
      >
        {saving ? "Saving…" : "Save image"}
      </button>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
