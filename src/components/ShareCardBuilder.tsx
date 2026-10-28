"use client";

import { useEffect, useState } from "react";
import {
  CARD_ACCENTS,
  CARD_FORMATS,
  CARD_HEADINGS,
  DEFAULT_CARD,
  cardQuery,
  type CardAccent,
  type CardFormat,
  type CardHeading,
  type CardOptions,
} from "@/lib/share-card";

const TOGGLES = [
  ["ratings", "Ratings"],
  ["dates", "Dates"],
  ["avatar", "Picture"],
  ["stats", "Stats"],
] as const;

// Builds a share-card URL from fixed options and previews the PNG. The
// preview URL is debounced so dragging through options doesn't render a
// card per click.
export function ShareCardBuilder({ username }: { username: string }) {
  const [opts, setOpts] = useState<CardOptions>(DEFAULT_CARD);
  const path = `/u/${username}/card${cardQuery(opts)}`;
  const [preview, setPreview] = useState(path);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setPreview((prev) => {
        if (prev !== path) setLoading(true);
        return path;
      });
    }, 400);
    return () => clearTimeout(t);
  }, [path]);

  const set = <K extends keyof CardOptions>(k: K, v: CardOptions[K]) => {
    setCopied(false);
    setOpts((o) => ({ ...o, [k]: v }));
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
    <div className="space-y-4">
      <div
        className="relative mx-auto w-full overflow-hidden rounded-lg border border-edge bg-canvas"
        style={{ aspectRatio: `${width} / ${height}`, maxWidth: opts.format === "story" ? 240 : undefined }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={preview}
          src={preview}
          alt="Preview of your share card"
          onLoad={() => setLoading(false)}
          className={`h-full w-full object-contain transition-opacity ${loading ? "opacity-50" : ""}`}
        />
      </div>

      <div className="space-y-3 text-xs">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Format">
          {(Object.keys(CARD_FORMATS) as CardFormat[]).map((f) => (
            <button key={f} type="button" aria-pressed={opts.format === f} onClick={() => set("format", f)} className={chip}>
              {CARD_FORMATS[f].label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Heading">
          {(Object.keys(CARD_HEADINGS) as CardHeading[]).map((h) => (
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
        <a
          href={path}
          download={`beaten-${username}-${opts.format}.png`}
          className="rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 transition"
        >
          Download PNG
        </a>
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-edge px-3 py-2 text-sm text-fog hover:border-fog/50 hover:text-white transition"
        >
          {copied ? "Link copied" : "Copy image link"}
        </button>
      </div>
    </div>
  );
}
