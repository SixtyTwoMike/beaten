// Pull List sorting and grouping, shared by the page (sorted in the browser,
// so switching is instant) and /api/v1. Client-safe: no database here.

export type PullEntry = {
  igdbId: number;
  name: string;
  coverUrl: string | null;
  // YYYY-MM-DD, or null when IGDB has no date (TBA)
  releaseDate: string | null;
  genres: string[];
  platformIds: number[];
  // "MANUAL" | "STEAM"
  source: string;
  addedAt: string;
};

export const PULL_SORTS = {
  order: "My order",
  release: "Release date",
  genre: "Genre",
  added: "Recently added",
  name: "Name",
} as const;

export type PullSort = keyof typeof PULL_SORTS;

export function isPullSort(v: unknown): v is PullSort {
  return typeof v === "string" && Object.hasOwn(PULL_SORTS, v);
}

export const NO_GENRE = "Other";

// Out, coming soon or TBA, for the badge and the release-date sort.
export function releaseState(entry: PullEntry, today = new Date().toISOString().slice(0, 10)): "out" | "upcoming" | "tba" {
  if (!entry.releaseDate) return "tba";
  return entry.releaseDate <= today ? "out" : "upcoming";
}

export type PullGroup = { title: string | null; entries: PullEntry[] };

// Entries come in the user's order. Release date: soonest upcoming first,
// then TBA, then games already out (newest first). Genre: one section per
// genre (a game sits under its first, IGDB's main one), in the user's order.
export function sortPullList(entries: PullEntry[], sort: PullSort, genre: string | null = null): PullGroup[] {
  const list = genre ? entries.filter((e) => e.genres.includes(genre)) : [...entries];
  switch (sort) {
    case "release": {
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = list.filter((e) => releaseState(e, today) === "upcoming").sort((a, b) => a.releaseDate!.localeCompare(b.releaseDate!));
      const tba = list.filter((e) => !e.releaseDate);
      const out = list.filter((e) => releaseState(e, today) === "out").sort((a, b) => b.releaseDate!.localeCompare(a.releaseDate!));
      return [
        { title: "Coming up", entries: upcoming },
        { title: "No date yet", entries: tba },
        { title: "Out now", entries: out },
      ].filter((g) => g.entries.length);
    }
    case "genre": {
      const groups = new Map<string, PullEntry[]>();
      for (const e of list) {
        const g = genre ?? e.genres[0] ?? NO_GENRE;
        groups.set(g, [...(groups.get(g) ?? []), e]);
      }
      return [...groups]
        .sort(([a], [b]) => (a === NO_GENRE ? 1 : b === NO_GENRE ? -1 : a.localeCompare(b)))
        .map(([title, entries]) => ({ title, entries }));
    }
    case "added":
      return [{ title: null, entries: list.sort((a, b) => b.addedAt.localeCompare(a.addedAt)) }];
    case "name":
      return [{ title: null, entries: list.sort((a, b) => a.name.localeCompare(b.name)) }];
    default:
      return [{ title: null, entries: list }];
  }
}

// Every genre on the list, most common first.
export function pullGenres(entries: PullEntry[]): string[] {
  const counts = new Map<string, number>();
  for (const e of entries) for (const g of e.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g);
}
