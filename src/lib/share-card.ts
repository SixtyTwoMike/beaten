// Options for the generated share card (last 4 beaten, or last 4 played).
// Everything is a fixed choice (no free text), so a crafted URL can't put
// arbitrary words on someone's card.

export const CARD_FORMATS = {
  square: { width: 1080, height: 1080, label: "Square (feed, Bluesky)" },
  story: { width: 1080, height: 1920, label: "Story (Instagram)" },
  wide: { width: 1200, height: 630, label: "Link preview" },
} as const;
export type CardFormat = keyof typeof CARD_FORMATS;

// Which games: finished ones, or anything logged (including in progress).
export const CARD_SOURCES = {
  beaten: "Last 4 beaten",
  played: "Last 4 played",
} as const;
export type CardSource = keyof typeof CARD_SOURCES;

export const CARD_HEADINGS = {
  last4: "My last 4 beaten",
  recent: "Recently beaten",
  latest: "Latest conquests",
  played4: "My last 4 played",
  playedRecent: "Recently played",
  playing: "What I've been playing",
} as const;
export type CardHeading = keyof typeof CARD_HEADINGS;

// Headings that fit each source; the first is the default.
export const HEADINGS_FOR: Record<CardSource, readonly CardHeading[]> = {
  beaten: ["last4", "recent", "latest"],
  played: ["played4", "playedRecent", "playing"],
};

export const CARD_ACCENTS = {
  mint: "#00d474",
  gold: "#ffb43a",
  sky: "#38bdf8",
  pink: "#f472b6",
  white: "#f3f6f9",
} as const;
export type CardAccent = keyof typeof CARD_ACCENTS;

export type CardOptions = {
  source: CardSource;
  format: CardFormat;
  heading: CardHeading;
  accent: CardAccent;
  background: "art" | "plain";
  ratings: boolean;
  dates: boolean;
  avatar: boolean;
  stats: boolean;
};

export const DEFAULT_CARD: CardOptions = {
  source: "beaten",
  format: "square",
  heading: "last4",
  accent: "mint",
  background: "art",
  ratings: true,
  dates: true,
  avatar: true,
  stats: true,
};

const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const flag = (v: string | null, fallback: boolean) => (v === "1" ? true : v === "0" ? false : fallback);

export function parseCardOptions(params: URLSearchParams): CardOptions {
  const d = DEFAULT_CARD;
  const source = pick(params.get("games"), Object.keys(CARD_SOURCES) as CardSource[], d.source);
  const headings = HEADINGS_FOR[source];
  return {
    source,
    format: pick(params.get("format"), Object.keys(CARD_FORMATS) as CardFormat[], d.format),
    heading: pick(params.get("heading"), headings, headings[0]),
    accent: pick(params.get("accent"), Object.keys(CARD_ACCENTS) as CardAccent[], d.accent),
    background: pick(params.get("bg"), ["art", "plain"] as const, d.background),
    ratings: flag(params.get("ratings"), d.ratings),
    dates: flag(params.get("dates"), d.dates),
    avatar: flag(params.get("avatar"), d.avatar),
    stats: flag(params.get("stats"), d.stats),
  };
}

// Canonical query string (only non-default values), so equal cards share a
// URL and cache entry.
export function cardQuery(o: CardOptions): string {
  const d = DEFAULT_CARD;
  const q = new URLSearchParams();
  if (o.source !== d.source) q.set("games", o.source);
  if (o.format !== d.format) q.set("format", o.format);
  if (o.heading !== HEADINGS_FOR[o.source][0]) q.set("heading", o.heading);
  if (o.accent !== d.accent) q.set("accent", o.accent);
  if (o.background !== d.background) q.set("bg", o.background);
  for (const k of ["ratings", "dates", "avatar", "stats"] as const) {
    if (o[k] !== d[k]) q.set(k, o[k] ? "1" : "0");
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
