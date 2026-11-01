/* eslint-disable @next/next/no-img-element -- satori markup, not the DOM */
import type { ChronicleStop, ChronicleView } from "../chronicle-core";
import { CARD_ACCENTS, CARD_FORMATS, type CardAccent, type CardFormat } from "../share-card";
import { Backdrop, CANVAS, COVER_SHADOW, FOG } from "./share-card-markup";

// Console Chronicles as an image, in the share card's style: your consoles
// as tiles (photo, name, the year you got it, the games you played most on
// it). Drawn in the browser on the web and natively in the app; the server
// only draws it for link previews (app/[username]/chronicles/card).

export const CHRONICLE_PICKS = { latest: "Latest 4", first: "First 4", all: "All of them" } as const;
export type ChroniclePick = keyof typeof CHRONICLE_PICKS;

export type ChronicleCardOptions = {
  format: CardFormat;
  pick: ChroniclePick;
  // Null: the chronicle's own accent.
  accent: CardAccent | null;
  games: boolean;
  ages: boolean;
};

export const DEFAULT_CHRONICLE_CARD: ChronicleCardOptions = { format: "square", pick: "all", accent: null, games: true, ages: true };

// The most tiles "all" fits in each format; past that, "+N more".
const ALL_FITS: Record<CardFormat, { columns: number; max: number }> = {
  square: { columns: 3, max: 9 },
  story: { columns: 3, max: 12 },
  wide: { columns: 6, max: 6 },
};

// Console photos as PNG (the server's renderer doesn't read WebP).
export const artSrc = (src: string) => src.replace(/\.webp$/, ".png");

export function chronicleStops(view: ChronicleView, pick: ChroniclePick, format: CardFormat): { stops: ChronicleStop[]; more: number } {
  if (pick === "first") return { stops: view.stops.slice(0, 4), more: 0 };
  if (pick === "latest") return { stops: view.stops.slice(-4), more: 0 };
  const { max } = ALL_FITS[format];
  if (view.stops.length <= max) return { stops: view.stops, more: 0 };
  // Keep the first and the newest; "+N more" stands in for the middle.
  const keep = max - 1;
  return { stops: [...view.stops.slice(0, 1), ...view.stops.slice(-(keep - 1))], more: view.stops.length - keep };
}

function Tile({ stop, width, height, accent, opts, view, compact }: {
  stop: ChronicleStop;
  width: number;
  height: number;
  accent: string;
  opts: ChronicleCardOptions;
  view: ChronicleView;
  compact: boolean;
}) {
  const padding = compact ? 14 : 18;
  const gap = compact ? 6 : 10;
  const nameSize = compact ? 20 : 26;
  const yearSize = compact ? 16 : 20;
  const text = nameSize * 1.2 * 2 + yearSize * 1.3 + gap * 2;
  const inner = height - 2 * padding;
  // Covers get what's left under the photo and text, if that's enough.
  const photoH = Math.round(inner * (opts.games && !compact ? 0.42 : 0.6));
  const coverRoom = inner - photoH - text - gap;
  const coverW = Math.floor(Math.min(((coverRoom * 264) / 374), (width - 2 * padding - 16) / 3));
  const showGames = opts.games && !compact && coverW >= 44 && stop.games.some((g) => g.coverUrl);
  const name = stop.model ? `${stop.platformName} ${stop.model}` : stop.platformName;
  const age = opts.ages && view.showAges && stop.age != null ? ` · age ${stop.age}` : "";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width,
        height,
        padding,
        borderRadius: 20,
        backgroundColor: "rgba(22,28,34,0.92)",
        border: "1px solid rgba(255,255,255,0.08)",
        gap,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: photoH, width: "100%" }}>
        {stop.art ? (
          <img
            src={artSrc(stop.art.src)}
            width={stop.art.width}
            height={stop.art.height}
            style={{ maxWidth: "100%", maxHeight: photoH, objectFit: "contain" }}
            alt=""
          />
        ) : (
          <div style={{ display: "flex", width: "60%", height: "70%", borderRadius: 14, backgroundImage: "linear-gradient(160deg, #2b3b55, #141b26)" }} />
        )}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: nameSize,
          fontWeight: 700,
          color: "white",
          lineHeight: 1.2,
          maxHeight: nameSize * 1.2 * 2,
          overflow: "hidden",
        }}
      >
        {name}
      </div>
      <div style={{ display: "flex", fontSize: yearSize, fontWeight: 600, color: accent }}>{`${stop.gotLabel}${age}`}</div>
      {showGames && (
        <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
          {stop.games.slice(0, 3).map((g) =>
            g.coverUrl ? (
              <img
                key={g.igdbId}
                src={g.coverUrl}
                width={coverW}
                height={Math.round((coverW * 374) / 264)}
                style={{ borderRadius: 8, objectFit: "cover", boxShadow: COVER_SHADOW }}
                alt=""
              />
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

export function chronicleCardMarkup(view: ChronicleView, opts: ChronicleCardOptions) {
  const { width, height } = CARD_FORMATS[opts.format];
  const accent = opts.accent ? CARD_ACCENTS[opts.accent] : view.accentHex;
  const story = opts.format === "story";
  const wide = opts.format === "wide";
  const pad = wide ? 48 : 72;
  const gap = wide ? 16 : 24;
  const { stops, more } = chronicleStops(view, opts.pick, opts.format);
  const four = opts.pick !== "all";
  const columns = four ? (wide ? 4 : 2) : ALL_FITS[opts.format].columns;
  const cells = stops.length + (more ? 1 : 0);
  const rows = Math.max(1, Math.ceil(cells / columns));
  // Room left for the grid once the header and footer are in.
  const chrome = wide ? 230 : story ? 520 : 330;
  const tileW = Math.floor((width - 2 * pad - (columns - 1) * gap) / columns);
  const tileH = Math.min(Math.floor((height - 2 * pad - chrome - (rows - 1) * gap) / rows), Math.round(tileW * (opts.games ? 1.75 : 1.3)));
  const compact = tileH < 260 || tileW < 200;
  const first = view.stops[0];

  const heading = (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 10, height: wide ? 30 : story ? 52 : 42, borderRadius: 4, backgroundColor: accent }} />
      <div style={{ fontSize: wide ? 34 : story ? 60 : 50, fontWeight: 700, color: "white" }}>{view.title}</div>
    </div>
  );

  const stats = (
    <div style={{ display: "flex", gap: 36 }}>
      {[
        [String(view.stops.length), view.stops.length === 1 ? "console" : "consoles"],
        ...(first ? [[String(first.year), "since"]] : []),
      ].map(([value, label]) => (
        <div key={label} style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: wide ? 30 : story ? 54 : 44, fontWeight: 700, color: accent }}>{value}</div>
          <div style={{ display: "flex", fontSize: wide ? 16 : story ? 24 : 20, color: FOG, textTransform: "uppercase", letterSpacing: 2 }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );

  const who = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontSize: wide ? 28 : story ? 44 : 36, fontWeight: 700, color: "white" }}>{view.name}</div>
      {view.username && <div style={{ display: "flex", fontSize: wide ? 18 : story ? 26 : 22, color: FOG }}>{`@${view.username}`}</div>}
    </div>
  );

  const grid = (
    <div style={{ display: "flex", flexWrap: "wrap", gap, justifyContent: story && four ? "center" : "flex-start" }}>
      {stops.length === 0 ? (
        <div style={{ display: "flex", fontSize: 32, color: FOG }}>No consoles yet.</div>
      ) : (
        stops.map((s) => <Tile key={s.id} stop={s} width={tileW} height={tileH} accent={accent} opts={opts} view={view} compact={compact} />)
      )}
      {more > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: tileW,
            height: tileH,
            borderRadius: 20,
            border: `2px dashed ${accent}`,
            fontSize: compact ? 28 : 36,
            fontWeight: 700,
            color: accent,
          }}
        >
          {`+${more} more`}
        </div>
      )}
    </div>
  );

  const logo = <div style={{ display: "flex", fontSize: wide ? 24 : story ? 40 : 32, fontWeight: 600, letterSpacing: "0.18em", color: "white" }}>BEATEN</div>;
  const footer = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: wide ? 18 : story ? 28 : 22, color: FOG }}>
      <div style={{ display: "flex" }}>{view.username ? `beaten.games/${view.username}/chronicles` : "beaten.games/chronicles"}</div>
      {logo}
    </div>
  );

  return (
    <div style={{ width, height, display: "flex", position: "relative", backgroundColor: CANVAS, fontFamily: "Geist" }}>
      <Backdrop art={null} width={width} height={height} accent={accent} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width, height, padding: pad }}>
        <div style={{ display: "flex", flexDirection: "column", gap: wide ? 18 : story ? 48 : 30 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {who}
            {!story && stats}
          </div>
          {story && stats}
          {heading}
        </div>
        {grid}
        {footer}
      </div>
    </div>
  );
}
