// Options for the generated "last 4 beaten" share card. Everything is a
// fixed choice (no free text), so a crafted URL can't put arbitrary words
// on someone's card.

export const CARD_FORMATS = {
  square: { width: 1080, height: 1080, label: "Square (feed, Bluesky)" },
  story: { width: 1080, height: 1920, label: "Story (Instagram)" },
  wide: { width: 1200, height: 630, label: "Link preview" },
} as const;
export type CardFormat = keyof typeof CARD_FORMATS;

export const CARD_HEADINGS = {
  last4: "My last 4 beaten",
  recent: "Recently beaten",
  latest: "Latest conquests",
} as const;
export type CardHeading = keyof typeof CARD_HEADINGS;

export const CARD_ACCENTS = {
  mint: "#00d474",
  gold: "#ffb43a",
  sky: "#38bdf8",
  pink: "#f472b6",
  white: "#f3f6f9",
} as const;
export type CardAccent = keyof typeof CARD_ACCENTS;

export type CardOptions = {
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
  return {
    format: pick(params.get("format"), Object.keys(CARD_FORMATS) as CardFormat[], d.format),
    heading: pick(params.get("heading"), Object.keys(CARD_HEADINGS) as CardHeading[], d.heading),
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
  if (o.format !== d.format) q.set("format", o.format);
  if (o.heading !== d.heading) q.set("heading", o.heading);
  if (o.accent !== d.accent) q.set("accent", o.accent);
  if (o.background !== d.background) q.set("bg", o.background);
  for (const k of ["ratings", "dates", "avatar", "stats"] as const) {
    if (o[k] !== d[k]) q.set(k, o[k] ? "1" : "0");
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
