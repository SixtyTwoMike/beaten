import { prisma } from "./db";
import { consoleArt, type ConsoleArt } from "./console-art";
import { formatPartialDate } from "./format";
import { getPlatforms } from "./platforms";
import { CARD_ACCENTS, type CardAccent } from "./share-card";

// Console Chronicles: someone's consoles in the order they got them, drawn
// as a zig-zag road. Shared by the editor, the public page and the story
// images, which all render the same ChronicleView.

export const CHRONICLE_BACKGROUNDS = { glow: "Glow", plain: "Plain", grid: "Retro grid" } as const;
export type ChronicleBackground = keyof typeof CHRONICLE_BACKGROUNDS;

export const CHRONICLE_PATHS = { dotted: "Dotted trail", neon: "Neon", pixel: "Pixel road" } as const;
export type ChroniclePath = keyof typeof CHRONICLE_PATHS;

export const MAX_ENTRIES = 40;
export const MAX_NOTE = 80;
export const MAX_MODEL = 30;
export const MAX_TITLE = 40;
export const DEFAULT_TITLE = "My console chronicles";

// Consoles per Instagram story page.
export const STORY_PER_PAGE = 3;

// The best-sellers, pinned above the full list in the picker (IGDB has no
// popularity for platforms).
export const POPULAR_CONSOLES = [
  8, 20, 130, 33, 7, 48, 5, 37, 12, 9, 24, 38, 18, 19, 167, 49, 169, 4, 29, 21, 11, 22, 41, 46, 508, 59, 64,
  35, 32, 23, 6,
];

// IGDB platform types offered: consoles, handhelds, plus PC.
const CONSOLE_TYPES = new Set([1, 5]);
const HANDHELD_TYPE = 5;
// IGDB files the Switches as home consoles; they're handhelds too.
const HYBRIDS = new Set([130, 508]);
// Known handhelds, for a platform list synced before IGDB types were stored.
const HANDHELDS = new Set([33, 22, 24, 20, 159, 37, 137, 38, 46, 35, 61, 119, 120, 57]);

export type ConsoleOption = { id: number; name: string; popular: boolean };

export async function consoleOptions(): Promise<ConsoleOption[]> {
  const platforms = await getPlatforms();
  const popular = new Set(POPULAR_CONSOLES);
  return platforms
    .filter((p) => CONSOLE_TYPES.has(p.category ?? -1) || p.id === 6 || popular.has(p.id) || HANDHELDS.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, popular: popular.has(p.id) }));
}

export function isAccent(v: unknown): v is CardAccent {
  return typeof v === "string" && v in CARD_ACCENTS;
}
export function isBackground(v: unknown): v is ChronicleBackground {
  return typeof v === "string" && v in CHRONICLE_BACKGROUNDS;
}
export function isPath(v: unknown): v is ChroniclePath {
  return typeof v === "string" && v in CHRONICLE_PATHS;
}

export type ChronicleBadge = "FIRST_CONSOLE" | "FIRST_HANDHELD";
export const BADGE_LABELS: Record<ChronicleBadge, string> = {
  FIRST_CONSOLE: "First console",
  FIRST_HANDHELD: "First handheld",
};

export type ChronicleStop = {
  id: string;
  platformId: number;
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

export async function loadChronicle(user: { id: string; name: string | null; username: string | null }): Promise<ChronicleView> {
  const [chronicle, platforms] = await Promise.all([
    prisma.chronicle.findUnique({
      where: { userId: user.id },
      include: {
        entries: {
          orderBy: [{ gotAt: "asc" }, { createdAt: "asc" }],
          include: {
            games: { orderBy: { position: "asc" }, include: { game: { select: { igdbId: true, name: true, coverUrl: true } } } },
          },
        },
      },
    }),
    getPlatforms(),
  ]);
  const byId = new Map(platforms.map((p) => [p.id, p]));
  const birthYear = chronicle?.birthYear ?? null;

  let firstConsole = false;
  let firstHandheld = false;
  const stops: ChronicleStop[] = (chronicle?.entries ?? []).map((e) => {
    const platform = byId.get(e.platformId);
    const pureHandheld = platform?.category === HANDHELD_TYPE || HANDHELDS.has(e.platformId);
    const handheld = pureHandheld || HYBRIDS.has(e.platformId);
    const homeConsole = !pureHandheld;
    const badges: ChronicleBadge[] = [];
    if (homeConsole && !firstConsole) {
      firstConsole = true;
      badges.push("FIRST_CONSOLE");
    }
    if (handheld && !firstHandheld) {
      firstHandheld = true;
      badges.push("FIRST_HANDHELD");
    }
    const year = e.gotAt.getUTCFullYear();
    const precision = e.gotPrecision ?? "DAY";
    const iso = e.gotAt.toISOString();
    return {
      id: e.id,
      platformId: e.platformId,
      platformName: platform?.name ?? "Unknown console",
      model: e.model,
      gotAt: precision === "YEAR" ? iso.slice(0, 4) : precision === "MONTH" ? iso.slice(0, 7) : iso.slice(0, 10),
      gotLabel: formatPartialDate(e.gotAt, precision === "DAY" ? "MONTH" : precision),
      year,
      age: e.age ?? (birthYear ? Math.max(0, year - birthYear) : null),
      ageTyped: e.age,
      note: e.note,
      badges,
      art: consoleArt(e.platformId, platform?.logoImageId),
      games: e.games.map((g) => g.game),
    };
  });

  const accent = isAccent(chronicle?.accent) ? chronicle.accent : "mint";
  return {
    title: chronicle?.title || DEFAULT_TITLE,
    name: user.name || (user.username ? `@${user.username}` : "Me"),
    username: user.username,
    birthYear,
    showAges: chronicle?.showAges ?? true,
    accent,
    accentHex: CARD_ACCENTS[accent],
    background: isBackground(chronicle?.background) ? chronicle.background : "glow",
    path: isPath(chronicle?.path) ? chronicle.path : "dotted",
    stops,
  };
}
