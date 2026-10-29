import {
  DEFAULT_TITLE,
  MAX_ENTRIES,
  buildStops,
  checkEntry,
  isAccent,
  isBackground,
  isPath,
  type ChronicleView,
  type ConsoleOption,
  type EntryFields,
} from "./chronicle-core";
import { CARD_ACCENTS } from "./share-card";

// A Console Chronicle made without an account, kept in this browser's
// localStorage until it's brought into an account
// (actions/chronicle importGuestChronicle). Storage can be missing or
// throw (private mode, blocked site data): every access is guarded and the
// editor still works for the visit.

const KEY = "beaten.guest-chronicle.v1";

export type GuestGame = { igdbId: number; name: string; coverUrl: string | null };
export type GuestEntry = Omit<EntryFields, "games"> & { id: string; games: GuestGame[] };
export type GuestChronicleData = {
  title: string;
  name: string;
  birthYear: number | null;
  showAges: boolean;
  accent: string;
  background: string;
  path: string;
  entries: GuestEntry[];
};

export const EMPTY_GUEST: GuestChronicleData = {
  title: "",
  name: "",
  birthYear: null,
  showAges: true,
  accent: "mint",
  background: "glow",
  path: "dotted",
  entries: [],
};

const isGame = (g: unknown): g is GuestGame =>
  typeof g === "object" && g !== null && Number.isInteger((g as GuestGame).igdbId) && typeof (g as GuestGame).name === "string";

// Whatever's stored, reduced to entries that would pass the account checks.
function sanitize(raw: unknown): GuestChronicleData | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<GuestChronicleData>;
  const entries = (Array.isArray(r.entries) ? r.entries : []).slice(0, MAX_ENTRIES).flatMap((e): GuestEntry[] => {
    if (typeof e !== "object" || e === null || typeof e.id !== "string") return [];
    const games = (Array.isArray(e.games) ? e.games : []).filter(isGame).slice(0, 3);
    const c = checkEntry({ ...e, games: games.map((g) => g.igdbId) });
    if (!c.ok) return [];
    // Only https cover art from IGDB is drawn.
    const safeGames = games.map((g) => ({
      igdbId: g.igdbId,
      name: g.name.slice(0, 200),
      coverUrl: typeof g.coverUrl === "string" && g.coverUrl.startsWith("https://images.igdb.com/") ? g.coverUrl : null,
    }));
    return [{ id: e.id.slice(0, 40), platformId: e.platformId, variant: c.entry.variant, model: c.entry.model, gotAt: e.gotAt, age: c.entry.age, note: c.entry.note, games: safeGames }];
  });
  return {
    title: typeof r.title === "string" ? r.title.slice(0, 40) : "",
    name: typeof r.name === "string" ? r.name.slice(0, 40) : "",
    birthYear: typeof r.birthYear === "number" ? r.birthYear : null,
    showAges: r.showAges !== false,
    accent: isAccent(r.accent) ? r.accent : "mint",
    background: isBackground(r.background) ? r.background : "glow",
    path: isPath(r.path) ? r.path : "dotted",
    entries,
  };
}

export function readGuestChronicle(): GuestChronicleData | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeGuestChronicle(data: GuestChronicleData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearGuestChronicle() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

// The same ChronicleView the account editor draws, from the browser copy.
export function guestView(data: GuestChronicleData, consoles: ConsoleOption[]): ChronicleView {
  const byValue = new Map(consoles.map((c) => [c.value, c]));
  const stops = buildStops(
    data.entries
      .flatMap((e) => {
        const c = checkEntry({ ...e, games: [] });
        const option = byValue.get(`${e.platformId}${e.variant ? `:${e.variant}` : ""}`);
        if (!c.ok || !option) return [];
        return [{
          id: e.id,
          platformId: e.platformId,
          variant: e.variant ?? null,
          platformName: option.name,
          kind: option.kind,
          art: option.art,
          model: c.entry.model,
          gotAt: c.entry.gotAt,
          gotPrecision: c.entry.gotPrecision,
          age: c.entry.age,
          note: c.entry.note,
          games: e.games,
        }];
      })
      // Stable: same-date consoles stay in the order they were added.
      .sort((a, b) => a.gotAt.getTime() - b.gotAt.getTime()),
    data.birthYear
  );
  const accent = isAccent(data.accent) ? data.accent : "mint";
  return {
    title: data.title.trim() || DEFAULT_TITLE,
    name: data.name.trim() || "Me",
    username: null,
    birthYear: data.birthYear,
    showAges: data.showAges,
    accent,
    accentHex: CARD_ACCENTS[accent],
    background: isBackground(data.background) ? data.background : "glow",
    path: isPath(data.path) ? data.path : "dotted",
    stops,
  };
}

// For the import action: what the account checks again server-side.
export function toImport(data: GuestChronicleData) {
  return {
    settings: {
      title: data.title,
      birthYear: data.birthYear,
      showAges: data.showAges,
      accent: data.accent,
      background: data.background,
      path: data.path,
    },
    entries: data.entries.map((e) => ({
      platformId: e.platformId,
      variant: e.variant,
      model: e.model,
      gotAt: e.gotAt,
      age: e.age,
      note: e.note,
      games: e.games.map((g) => g.igdbId),
    })),
  };
}
