"use client";

import { useEffect, useState } from "react";
import { renderCardSvg, svgToPng, svgUrl } from "@/lib/cards/render-client";
import type { ShareCardData } from "@/lib/cards/share-card-markup";
import {
  CARD_ACCENTS,
  CARD_FORMATS,
  CARD_HEADINGS,
  CARD_SOURCES,
  DEFAULT_CARD,
  HEADINGS_FOR,
  cardQuery,
  type CardAccent,
  type CardFormat,
  type CardOptions,
  type CardSource,
} from "@/lib/share-card";

const TOGGLES = [
  ["ratings", "Ratings"],
  ["dates", "Dates"],
  ["avatar", "Picture"],
  ["stats", "Stats"],
] as const;

// Builds a share card from fixed options. It's drawn on this device (a
// Web Worker lays it out from the same markup the server uses), so
// previews are quick and nothing waits on the server; the last preview
// stays up until the next one arrives. "Copy image link" gives the
// server-drawn PNG's URL, for posting where an image link is wanted.
export function ShareCardBuilder({ username, data }: { username: string; data: ShareCardData }) {
  const [opts, setOpts] = useState<CardOptions>(DEFAULT_CARD);
  const path = `/${username}/card${cardQuery(opts)}`;
  const [card, setCard] = useState<{ svg: string; url: string; width: number; height: number; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const key = JSON.stringify(opts);
  const loading = card?.key !== key;

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await renderCardSvg({ kind: "share", data, opts });
        if (cancelled) return;
        setError(null);
        setCard((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { ...r, url: svgUrl(r.svg), key };
        });
      } catch (e) {
        console.error("share card failed:", e);
        if (!cancelled) setError("Couldn't draw the card on this device.");
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // key stands for opts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, data]);

  async function save() {
    if (!card) return;
    setSaving(true);
    try {
      const file = await svgToPng(card.svg, card.width, card.height, `beaten-${username}-${opts.source}-${opts.format}`);
      if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
        await navigator.share({ files: [file] }).catch(() => {});
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      }
    } catch (e) {
      console.error("share card PNG failed:", e);
      setError("Couldn't save the image on this device.");
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof CardOptions>(k: K, v: CardOptions[K]) => {
    setCopied(false);
    setOpts((o) => ({ ...o, [k]: v }));
  };

  // Switching between beaten and played swaps in a heading that fits.
  const setSource = (source: CardSource) => {
    setCopied(false);
    setOpts((o) => ({ ...o, source, heading: HEADINGS_FOR[source][0] }));
  };

  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const chip =
    "rounded-full border border-edge px-3 py-1 text-fog aria-pressed:border-mint/60 aria-pressed:bg-mint/10 aria-pressed:text-white";
  const { width, height } = CARD_FORMATS[opts.format];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div
        className="relative mx-auto w-full overflow-hidden rounded-lg border border-edge bg-canvas"
        style={{ aspectRatio: `${width} / ${height}`, maxWidth: opts.format === "story" ? 360 : undefined }}
      >
        {card && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.url}
            alt="Preview of your share card"
            className={`h-full w-full object-contain transition-opacity ${loading ? "opacity-40" : ""}`}
          />
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

      <div className="space-y-5">
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Games">
            {(Object.keys(CARD_SOURCES) as CardSource[]).map((src) => (
              <button key={src} type="button" aria-pressed={opts.source === src} onClick={() => setSource(src)} className={chip}>
                {CARD_SOURCES[src]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Format">
            {(Object.keys(CARD_FORMATS) as CardFormat[]).map((f) => (
              <button key={f} type="button" aria-pressed={opts.format === f} onClick={() => set("format", f)} className={chip}>
                {CARD_FORMATS[f].label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Heading">
            {HEADINGS_FOR[opts.source].map((h) => (
              <button key={h} type="button" aria-pressed={opts.heading === h} onClick={() => set("heading", h)} className={chip}>
                {CARD_HEADINGS[h]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Accent colour">
            {(Object.keys(CARD_ACCENTS) as CardAccent[]).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={opts.accent === a}
                aria-label={a}
                title={a}
                onClick={() => set("accent", a)}
                className="h-7 w-7 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-card aria-pressed:ring-white"
                style={{ backgroundColor: CARD_ACCENTS[a] }}
              />
            ))}
            <span className="mx-1 h-5 w-px bg-edge" />
            <button
              type="button"
              aria-pressed={opts.background === "art"}
              onClick={() => set("background", opts.background === "art" ? "plain" : "art")}
              className={chip}
            >
              Game art background
            </button>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
            {TOGGLES.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={opts[k]} onClick={() => set(k, !opts[k])} className={chip}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!card || loading || saving}
            className="rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50 transition"
          >
            {saving ? "Saving…" : "Download PNG"}
          </button>
          <button
            type="button"
            onClick={copy}
            className="rounded-md border border-edge px-3 py-2 text-sm text-fog hover:border-fog/50 hover:text-white transition"
          >
            {copied ? "Link copied" : "Copy image link"}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
