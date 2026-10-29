import { variantOf, type ConsoleArt } from "./console-art";
import { parsePartialDate } from "./dates";
import { formatPartialDate } from "./format";
import { isIgdbId } from "./limits";
import { CARD_ACCENTS, type CardAccent } from "./share-card";

// The parts of Console Chronicles that run in the browser too: the guest
// editor (no account, saved in the browser; components/GuestChronicle)
// builds the same ChronicleView from local data. lib/chronicle.ts adds the
// database side and re-exports all of this.

export const CHRONICLE_BACKGROUNDS = { glow: "Glow", plain: "Plain", grid: "Retro grid" } as const;
export type ChronicleBackground = keyof typeof CHRONICLE_BACKGROUNDS;

export const CHRONICLE_PATHS = { dotted: "Dotted trail", neon: "Neon", pixel: "Pixel road" } as const;
export type ChroniclePath = keyof typeof CHRONICLE_PATHS;

export const MAX_ENTRIES = 40;
export const MAX_NOTE = 80;
export const MAX_MODEL = 30;
export const MAX_TITLE = 40;
export const DEFAULT_TITLE = "My console chronicles";

// IGDB platform types offered: consoles, handhelds and home computers,
// plus Windows, Mac and DOS PCs (filed as operating systems).
export const CONSOLE_TYPES = new Set([1, 5, 6]);
const HANDHELD_TYPE = 5;
const COMPUTER_TYPE = 6;
export const PCS = new Set([6, 14, 13]);
// Mainframes, lab machines and chips IGDB files as computers.
export const NOT_HOME_COMPUTERS = new Set([85, 95, 96, 97, 101, 102, 104, 105, 106, 107, 108, 109, 110, 140, 141, 409]);
// Known computers, for a platform list synced before IGDB types were stored.
export const COMPUTERS = new Set([6, 14, 13, 15, 16, 25, 26, 27, 53, 63, 65, 69, 71, 75, 115, 116, 134, 154, 373, 406, 126, 129]);
// IGDB files the Switches as home consoles; they're handhelds too.
const HYBRIDS = new Set([130, 508]);
// Known handhelds, for a platform list synced before IGDB types were stored.
export const HANDHELDS = new Set([33, 22, 24, 20, 159, 37, 137, 38, 46, 35, 61, 119, 120, 57]);

export type ConsoleKind = "console" | "handheld" | "hybrid" | "computer";

// What sort of machine a platform is, for the first-console / -handheld /
// -computer badges. `category` is IGDB's platform type.
export function consoleKind(platformId: number, category: number | null | undefined): ConsoleKind {
  if (category === HANDHELD_TYPE || HANDHELDS.has(platformId)) return "handheld";
  if (HYBRIDS.has(platformId)) return "hybrid";
  if (category === COMPUTER_TYPE || COMPUTERS.has(platformId)) return "computer";
  return "console";
}

// `value` is "<platformId>" or "<platformId>:<variant>". `search` holds
// extra words it can be found by (abbreviation, other regions' names).
export type ConsoleOption = {
  value: string;
  platformId: number;
  variant: string | null;
  name: string;
  search: string;
  thumb: string | null;
  popular: boolean;
  rank: number; // position in POPULAR_CONSOLES (best-sellers first)
  kind: ConsoleKind;
  art: ConsoleArt | null;
};

export function isAccent(v: unknown): v is CardAccent {
  return typeof v === "string" && v in CARD_ACCENTS;
}
export function isBackground(v: unknown): v is ChronicleBackground {
  return typeof v === "string" && v in CHRONICLE_BACKGROUNDS;
}
export function isPath(v: unknown): v is ChroniclePath {
  return typeof v === "string" && v in CHRONICLE_PATHS;
}

export type ChronicleBadge = "FIRST_CONSOLE" | "FIRST_HANDHELD" | "FIRST_COMPUTER";
export const BADGE_LABELS: Record<ChronicleBadge, string> = {
  FIRST_CONSOLE: "First console",
  FIRST_HANDHELD: "First handheld",
  FIRST_COMPUTER: "First computer",
};

export type ChronicleStop = {
  id: string;
  platformId: number;
  variant: string | null;
  platformName: string;
  model: string | null;
  gotAt: string; // YYYY, YYYY-MM or YYYY-MM-DD, for the editor
  gotLabel: string; // "2004", "Mar 2004"
  year: number;
  age: number | null;
  ageTyped: number | null;
  note: string | null;
  badges: ChronicleBadge[];
  art: ConsoleArt | null;
  games: { igdbId: number; name: string; coverUrl: string | null }[];
};

export type ChronicleView = {
  title: string;
  name: string;
  username: string | null;
  birthYear: number | null;
  showAges: boolean;
  accent: CardAccent;
  accentHex: string;
  background: ChronicleBackground;
  path: ChroniclePath;
  stops: ChronicleStop[];
};

// One console as stored (database row or the guest's browser copy), with
// what's known about its platform.
export type StopInput = {
  id: string;
  platformId: number;
  variant: string | null;
  platformName: string;
  kind: ConsoleKind;
  art: ConsoleArt | null;
  model: string | null;
  gotAt: Date;
  gotPrecision: string | null; // null = exact day
  age: number | null;
  note: string | null;
  games: { igdbId: number; name: string; coverUrl: string | null }[];
};

// Stops in the order given (callers sort by gotAt), with badges for the
// first home console, handheld and computer, and ages from the birth year.
export function buildStops(entries: StopInput[], birthYear: number | null): ChronicleStop[] {
  let firstConsole = false;
  let firstHandheld = false;
  let firstComputer = false;
  return entries.map((e) => {
    const badges: ChronicleBadge[] = [];
    if (e.kind !== "handheld" && e.kind !== "computer" && !firstConsole) {
      firstConsole = true;
      badges.push("FIRST_CONSOLE");
    }
    if ((e.kind === "handheld" || e.kind === "hybrid") && !firstHandheld) {
      firstHandheld = true;
      badges.push("FIRST_HANDHELD");
    }
    if (e.kind === "computer" && !firstComputer) {
      firstComputer = true;
      badges.push("FIRST_COMPUTER");
    }
    const year = e.gotAt.getUTCFullYear();
    const precision = e.gotPrecision ?? "DAY";
    const iso = e.gotAt.toISOString();
    return {
      id: e.id,
      platformId: e.platformId,
      variant: variantOf(e.platformId, e.variant) ? e.variant : null,
      platformName: e.platformName,
      model: e.model,
      gotAt: precision === "YEAR" ? iso.slice(0, 4) : precision === "MONTH" ? iso.slice(0, 7) : iso.slice(0, 10),
      gotLabel: formatPartialDate(e.gotAt, precision === "DAY" ? "MONTH" : precision),
      year,
      age: e.age ?? (birthYear ? Math.max(0, year - birthYear) : null),
      ageTyped: e.age,
      note: e.note,
      badges,
      art: e.art,
      games: e.games,
    };
  });
}


// Typed text: control characters out, spaces collapsed, length capped.
export function cleanText(v: unknown, max: number): string | null {
  const s = typeof v === "string" ? v.replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(/\s+/g, " ").trim() : "";
  return s ? s.slice(0, max) : null;
}

export type EntryFields = {
  platformId: number;
  variant?: string | null;
  model?: string | null;
  gotAt: string;
  age?: number | null;
  note?: string | null;
  games?: number[];
};

export type CheckedEntry = {
  platformId: number;
  variant: string | null;
  model: string | null;
  gotAt: Date;
  gotPrecision: string | null;
  age: number | null;
  note: string | null;
  igdbIds: number[];
};

// Checks one console as typed, for the account (actions/chronicle) and the
// guest editor alike. Whether the platform exists is the caller's check.
export function checkEntry(input: EntryFields): { ok: true; entry: CheckedEntry } | { ok: false; error: string } {
  if (!isIgdbId(input.platformId)) return { ok: false, error: "Pick a console" };
  const variant = input.variant ? String(input.variant) : null;
  if (variant && !variantOf(input.platformId, variant)) return { ok: false, error: "Pick a console" };
  const got = parsePartialDate(input.gotAt);
  const thisYear = new Date().getUTCFullYear();
  if (!got || got.date.getUTCFullYear() < 1970 || got.date.getUTCFullYear() > thisYear) {
    return { ok: false, error: "When did you get it? At least the year" };
  }
  const age = input.age == null || (input.age as unknown) === "" ? null : Number(input.age);
  if (age !== null && (!Number.isInteger(age) || age < 0 || age > 120)) {
    return { ok: false, error: "Age should be a whole number" };
  }
  const igdbIds = [...new Set(input.games ?? [])];
  if (igdbIds.length > 3 || !igdbIds.every(isIgdbId)) return { ok: false, error: "Pick up to three games" };
  return {
    ok: true,
    entry: {
      platformId: input.platformId,
      variant,
      model: cleanText(input.model, MAX_MODEL),
      gotAt: got.date,
      gotPrecision: got.precision === "DAY" ? null : got.precision,
      age,
      note: cleanText(input.note, MAX_NOTE),
      igdbIds,
    },
  };
}

export function checkBirthYear(v: number | null | undefined): number | null | false {
  const birthYear = v == null || v === 0 ? null : Number(v);
  if (birthYear === null) return null;
  return Number.isInteger(birthYear) && birthYear >= 1900 && birthYear <= new Date().getUTCFullYear() ? birthYear : false;
}
