// The physical collection's options, labels and grouping (docs/collection.md).
// Client-safe: the web components and lib/collection both use it.

export const REGIONS = [
  { value: "PAL", label: "PAL" },
  { value: "NTSC_U", label: "NTSC-U" },
  { value: "NTSC_J", label: "NTSC-J" },
  { value: "OTHER", label: "Other region" },
] as const;

export const COMPLETENESS = [
  { value: "LOOSE", label: "Loose" },
  { value: "CIB", label: "Boxed (CIB)" },
  { value: "SEALED", label: "Sealed" },
  { value: "BOX_ONLY", label: "Box only" },
] as const;

// Prices paid; minor units per currency (yen has none).
export const CURRENCIES = [
  { value: "GBP", symbol: "£", digits: 2 },
  { value: "USD", symbol: "$", digits: 2 },
  { value: "EUR", symbol: "€", digits: 2 },
  { value: "JPY", symbol: "¥", digits: 0 },
  { value: "CAD", symbol: "CA$", digits: 2 },
  { value: "AUD", symbol: "A$", digits: 2 },
] as const;

export const MAX_COLLECTION = 5000;
export const MAX_EDITION = 80;
export const MAX_COLLECTION_NOTES = 1000;

export const isRegion = (v: unknown): v is string => REGIONS.some((r) => r.value === v);
export const isCompleteness = (v: unknown): v is string => COMPLETENESS.some((c) => c.value === v);
export const isCurrency = (v: unknown): v is string => CURRENCIES.some((c) => c.value === v);

export const regionLabel = (v: string | null | undefined) => REGIONS.find((r) => r.value === v)?.label ?? null;
export const completenessLabel = (v: string | null | undefined) => COMPLETENESS.find((c) => c.value === v)?.label ?? null;

const currencyOf = (code: string | null | undefined) => CURRENCIES.find((c) => c.value === code) ?? CURRENCIES[0];

// "12.50" (as typed) → 1250 in minor units; null when empty, NaN when bad.
export function parsePrice(raw: string | null | undefined, currency: string | null | undefined): number | null {
  const text = (raw ?? "").trim().replace(/^[£$€¥]/, "").replace(/,/g, "");
  if (!text) return null;
  const { digits } = currencyOf(currency);
  if (!(digits ? /^\d{1,7}(\.\d{1,2})?$/ : /^\d{1,9}$/).test(text)) return NaN;
  return Math.round(Number(text) * 10 ** digits);
}

// 1250 → "12.50", for the price field.
export function priceInput(minor: number | null | undefined, currency: string | null | undefined): string {
  if (minor == null) return "";
  const { digits } = currencyOf(currency);
  return (minor / 10 ** digits).toFixed(digits);
}

// 1250 → "£12.50".
export function formatPrice(minor: number | null | undefined, currency: string | null | undefined): string | null {
  if (minor == null) return null;
  const c = currencyOf(currency);
  return `${c.symbol}${(minor / 10 ** c.digits).toFixed(c.digits)}`;
}

export type CollectionEntry = {
  id: string;
  igdbId: number;
  name: string;
  coverUrl: string | null;
  releaseYear: number | null;
  platformIds: number[];
  platformId: number;
  platformName: string;
  region: string | null;
  completeness: string | null;
  edition: string | null;
  // Private fields: null in public views.
  acquiredAt: string | null; // YYYY-MM-DD / YYYY-MM / YYYY
  pricePaid: number | null;
  currency: string | null;
  notes: string | null;
  createdAt: string;
};

export type CollectionSort = "platform" | "title" | "added";

export type CollectionGroup = { label: string; entries: CollectionEntry[] };

// By platform (A–Z, titles A–Z within), or one flat list by title or newest.
export function groupCollection(entries: CollectionEntry[], sort: CollectionSort): CollectionGroup[] {
  const byTitle = (a: CollectionEntry, b: CollectionEntry) => a.name.localeCompare(b.name);
  if (sort === "title") return [{ label: "", entries: [...entries].sort(byTitle) }];
  if (sort === "added") return [{ label: "", entries: [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }];
  const groups = new Map<string, CollectionEntry[]>();
  for (const e of entries) groups.set(e.platformName, [...(groups.get(e.platformName) ?? []), e]);
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, list]) => ({ label, entries: list.sort(byTitle) }));
}

// "PAL · Boxed (CIB) · Collector's Edition"
export function copyDetails(e: Pick<CollectionEntry, "region" | "completeness" | "edition">): string {
  return [regionLabel(e.region), completenessLabel(e.completeness), e.edition].filter(Boolean).join(" · ");
}
