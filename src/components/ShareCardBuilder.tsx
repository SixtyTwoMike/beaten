"use client";

import { useEffect, useRef, useState } from "react";
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

// Builds a share-card URL from fixed options and previews the PNG. The
// preview URL is debounced so clicking through options doesn't render a
// card per click. A card takes seconds to render the first time, so the
// last one stays up until the new one arrives, and once it has, the other
// sizes with the same options are rendered in the background (the server
// keeps them) so switching size is instant.
export function ShareCardBuilder({ username }: { username: string }) {
  const [opts, setOpts] = useState<CardOptions>(DEFAULT_CARD);
  const pathFor = (o: CardOptions) => `/${username}/card${cardQuery(o)}`;
  const path = pathFor(opts);
  const [previewOpts, setPreviewOpts] = useState(opts);
  const preview = pathFor(previewOpts);
  const [shown, setShown] = useState<string | null>(null);
  const loading = shown !== preview;
  const [copied, setCopied] = useState(false);
  const warmed = useRef(new Set<string>());

  useEffect(() => {
    const t = setTimeout(() => setPreviewOpts(opts), 400);
    return () => clearTimeout(t);
  }, [opts]);

  useEffect(() => {
    const img = new Image();
    img.onload = img.onerror = () => setShown(preview);
    img.src = preview;
    return () => {
      img.onload = img.onerror = null;
    };
  }, [preview]);

  // One at a time, so the server isn't asked for three renders at once.
  useEffect(() => {
    if (loading) return;
    warmed.current.add(preview);
    const others = (Object.keys(CARD_FORMATS) as CardFormat[])
      .map((format) => pathFor({ ...previewOpts, format }))
      .filter((p) => !warmed.current.has(p));
    let cancelled = false;
    let img: HTMLImageElement | null = null;
    const next = () => {
      const url = others.shift();
      if (cancelled || !url) return;
      warmed.current.add(url);
      img = new Image();
      img.onload = img.onerror = next;
      img.src = url;
    };
    const t = setTimeout(next, 1500);
    return () => {
      cancelled = true;
      clearTimeout(t);
      if (img) img.onload = img.onerror = null;
    };
    // pathFor only depends on username and the options already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, preview, previewOpts]);

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
        {shown && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt="Preview of your share card"
            className={`h-full w-full object-contain transition-opacity ${loading ? "opacity-40" : ""}`}
          />
        )}
        {loading && (
          <div role="status" className="absolute inset-0 flex items-center justify-center">
            <span className="flex items-center gap-2 rounded-full bg-canvas/85 px-3 py-1.5 text-xs text-fog">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-fog/40 border-t-mint" aria-hidden />
              Rendering…
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
          <a
            href={path}
            download={`beaten-${username}-${opts.source}-${opts.format}.png`}
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
    </div>
  );
}
