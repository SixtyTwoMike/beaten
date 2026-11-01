/* eslint-disable @next/next/no-img-element -- satori markup, not the DOM */
import { avatarLayout, type Avatar } from "../avatar";
import { formatPartialDate } from "../format";
import { CARD_ACCENTS, CARD_FORMATS, CARD_HEADINGS, type CardOptions } from "../share-card";
import { STAR_PATH } from "@/components/Stars";

// The share card's layout (satori markup), shared by the browser, which
// draws the card you're building (lib/cards/render-client.ts), and the
// server, which only draws it for link previews and the app
// (app/[username]/card). Plain data in, so it runs in either place.

export const CANVAS = "#0e1216";
export const FOG = "#8fa0b0";

export type CardGame = {
  name: string;
  coverUrl: string | null;
  artworkUrl: string | null;
  rating: number | null;
  // ISO, or null for something still being played / put down.
  finishedAt: string | null;
  finishedPrecision: string | null;
  status: string;
};

export type CardPerson = {
  display: string;
  username: string;
  avatar: Avatar | null;
  image: string | null;
};

export type ShareCardData = {
  person: CardPerson;
  beaten: CardGame[];
  played: CardGame[];
  beatenCount: number;
  thisYear: number;
  year: number;
};

export function Stars({ rating, size, color }: { rating: number; size: number; color: string }) {
  const pct = Math.max(0, Math.min(100, rating * 10));
  const row = (fill: string) =>
    [0, 1, 2, 3, 4].map((i) => (
      <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={fill}>
        <path d={STAR_PATH} />
      </svg>
    ));
  return (
    <div style={{ display: "flex", position: "relative", width: size * 5, height: size }}>
      <div style={{ display: "flex" }}>{row("rgba(255,255,255,0.18)")}</div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          top: 0,
          width: (size * 5 * pct) / 100,
          height: size,
          overflow: "hidden",
        }}
      >
        {row(color)}
      </div>
    </div>
  );
}

// A small, tight shadow: blur is the most expensive thing to draw.
export const COVER_SHADOW = "0 10px 20px rgba(0,0,0,0.55)";

function Cover({ game, width }: { game: CardGame; width: number }) {
  const height = Math.round((width * 374) / 264);
  const frame = { width, height, borderRadius: 14, boxShadow: COVER_SHADOW };
  if (game.coverUrl) {
    return <img src={game.coverUrl} width={width} height={height} style={{ ...frame, objectFit: "cover" }} alt="" />;
  }
  return (
    <div
      style={{
        ...frame,
        display: "flex",
        alignItems: "flex-end",
        padding: 16,
        backgroundImage: "linear-gradient(160deg, #2b3b55, #141b26)",
        color: "white",
        fontSize: width / 9,
        fontWeight: 600,
      }}
    >
      {game.name}
    </div>
  );
}

// The round picture: their game crop, else their Google photo, else an initial.
export function CardAvatar({ person, size, accent }: { person: CardPerson; size: number; accent: string }) {
  const ring = { borderRadius: 9999, border: `3px solid ${accent}` };
  if (person.avatar) {
    const l = avatarLayout(size, person.avatar);
    return (
      <div style={{ ...ring, display: "flex", position: "relative", width: size, height: size, overflow: "hidden" }}>
        <img
          src={person.avatar.url}
          width={l.width}
          height={l.height}
          style={{ position: "absolute", left: l.left, top: l.top, width: l.width, height: l.height }}
          alt=""
        />
      </div>
    );
  }
  if (person.image) {
    return <img src={person.image} width={size} height={size} style={{ ...ring, objectFit: "cover" }} alt="" />;
  }
  return (
    <div
      style={{
        ...ring,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        backgroundColor: "#1d2530",
        color: FOG,
        fontSize: size * 0.42,
        fontWeight: 700,
      }}
    >
      {person.display.replace(/^@/, "").charAt(0).toUpperCase()}
    </div>
  );
}

// Faded game art (or a glow in the accent colour) behind everything.
export function Backdrop({ art, width, height, accent }: { art: string | null; width: number; height: number; accent: string }) {
  const fill = { position: "absolute" as const, top: 0, left: 0, width, height, display: "flex" };
  if (!art) {
    return (
      <div
        style={{
          ...fill,
          backgroundImage: `radial-gradient(circle at 15% 0%, ${accent}40, transparent 55%), radial-gradient(circle at 100% 100%, ${accent}26, transparent 50%)`,
        }}
      />
    );
  }
  return (
    <div style={fill}>
      <img src={art} width={width} height={height} style={{ ...fill, objectFit: "cover", opacity: 0.45 }} alt="" />
      <div
        style={{
          ...fill,
          backgroundImage: `linear-gradient(180deg, rgba(14,18,22,0.55) 0%, rgba(14,18,22,0.82) 45%, ${CANVAS} 100%)`,
        }}
      />
    </div>
  );
}

export function shareCardMarkup(data: ShareCardData, opts: CardOptions) {
  const { person } = data;
  const played = opts.source === "played";
  const games = played ? data.played : data.beaten;
  const { width, height } = CARD_FORMATS[opts.format];
  const accent = CARD_ACCENTS[opts.accent];
  const story = opts.format === "story";
  const wide = opts.format === "wide";
  const pad = wide ? 52 : 72;
  const gap = story ? 44 : wide ? 24 : 28;
  const coverWidth = story ? 360 : wide ? 196 : Math.floor((width - 2 * pad - 3 * gap) / 4);
  const avatarSize = wide ? 64 : story ? 112 : 88;
  const backdrop = opts.background === "art" ? (games.find((g) => g.artworkUrl)?.artworkUrl ?? games[0]?.coverUrl ?? null) : null;

  const who = (
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      {opts.avatar && <CardAvatar person={person} size={avatarSize} accent={accent} />}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: wide ? 30 : story ? 46 : 38, fontWeight: 700, color: "white" }}>{person.display}</div>
        <div style={{ fontSize: wide ? 20 : story ? 28 : 24, color: FOG }}>{`@${person.username}`}</div>
      </div>
    </div>
  );

  const stats = opts.stats && (
    <div style={{ display: "flex", gap: 36 }}>
      {[
        [data.beatenCount, "games beaten"],
        [data.thisYear, `in ${data.year}`],
      ].map(([value, label]) => (
        <div key={String(label)} style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: wide ? 30 : story ? 54 : 44, fontWeight: 700, color: accent }}>{String(value)}</div>
          <div style={{ display: "flex", fontSize: wide ? 16 : story ? 24 : 20, color: FOG, textTransform: "uppercase", letterSpacing: 2 }}>
            {String(label)}
          </div>
        </div>
      ))}
    </div>
  );

  const logo = (
    <div style={{ fontSize: wide ? 26 : story ? 40 : 34, fontWeight: 600, letterSpacing: "0.18em", color: "white" }}>BEATEN</div>
  );

  const grid = (
    <div style={{ display: "flex", flexWrap: "wrap", gap, justifyContent: story ? "center" : "flex-start" }}>
      {games.length === 0 ? (
        <div style={{ fontSize: 32, color: FOG }}>{played ? "Nothing logged yet — watch this space." : "Nothing beaten yet — watch this space."}</div>
      ) : (
        games.map((g, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", width: coverWidth, gap: 10 }}>
            <Cover game={g} width={coverWidth} />
            <div
              style={{
                display: "flex",
                // Two lines at most (one on the link preview); longer names are cut.
                maxHeight: (wide ? 1 : 2) * 1.25 * (wide ? 18 : story ? 28 : 22),
                overflow: "hidden",
                fontSize: wide ? 18 : story ? 28 : 22,
                fontWeight: 600,
                color: "white",
                lineHeight: 1.25,
              }}
            >
              {g.name}
            </div>
            {(opts.ratings || opts.dates || !g.finishedAt) && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {opts.ratings && g.rating != null && <Stars rating={g.rating} size={wide ? 15 : story ? 26 : 20} color={accent} />}
                {opts.dates && g.finishedAt && (
                  <div style={{ fontSize: wide ? 15 : story ? 24 : 18, color: FOG }}>
                    {formatPartialDate(new Date(g.finishedAt), g.finishedPrecision)}
                  </div>
                )}
                {!g.finishedAt && (
                  <div
                    style={{
                      display: "flex",
                      fontSize: wide ? 13 : story ? 20 : 15,
                      fontWeight: 600,
                      color: accent,
                      textTransform: "uppercase",
                      letterSpacing: 1.5,
                    }}
                  >
                    {g.status === "SHELVED" ? "Shelved" : "Playing"}
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );

  const heading = (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 10, height: wide ? 30 : story ? 52 : 42, borderRadius: 4, backgroundColor: accent }} />
      <div style={{ fontSize: wide ? 34 : story ? 64 : 52, fontWeight: 700, color: "white" }}>{CARD_HEADINGS[opts.heading]}</div>
    </div>
  );

  const footer = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: wide ? 18 : story ? 28 : 22, color: FOG }}>
      <div>{`beaten.games/${person.username}`}</div>
      {!wide && logo}
    </div>
  );

  return (
    <div style={{ width, height, display: "flex", position: "relative", backgroundColor: CANVAS, fontFamily: "Geist" }}>
      <Backdrop art={backdrop} width={width} height={height} accent={accent} />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width,
          height,
          padding: pad,
        }}
      >
        {wide ? (
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flexGrow: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {who}
              {logo}
            </div>
            {heading}
            {grid}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              {footer}
              {stats}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flexGrow: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: story ? 56 : 36 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {who}
                {story ? null : stats}
              </div>
              {story && stats}
              {heading}
            </div>
            {grid}
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
