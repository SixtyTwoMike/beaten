import { prisma } from "./db";
import { CONSOLE_VARIANTS, consoleArt, variantOf } from "./console-art";
import {
  CONSOLE_TYPES,
  COMPUTERS,
  DEFAULT_TITLE,
  HANDHELDS,
  NOT_HOME_COMPUTERS,
  PCS,
  buildStops,
  consoleKind,
  isAccent,
  isBackground,
  isPath,
  type ChronicleView,
  type ConsoleOption,
} from "./chronicle-core";
import { getPlatforms } from "./platforms";
import { CARD_ACCENTS } from "./share-card";

export * from "./chronicle-core";

// Console Chronicles: someone's consoles in the order they got them, drawn
// as a zig-zag road. Shared by the editor, the public page and the story
// images, which all render the same ChronicleView.

// The best-sellers, pinned above the full list in the picker (IGDB has no
// popularity for platforms).
export const POPULAR_CONSOLES = [
  8, 20, 130, 33, 7, 48, 5, 37, 12, 9, 24, 38, 18, 19, 167, 49, 169, 4, 29, 21, 11, 22, 41, 46, 508, 59, 64,
  35, 32, 23, 6, 15, 26, 16, 25,
];

// Names people search by that IGDB's name or abbreviation don't cover.
const ALIASES: Record<number, string> = {
  7: "ps1 psx psone playstation 1",
  29: "genesis mega drive megadrive",
  19: "snes super nes super nintendo",
  58: "sfc",
  18: "nes famicom",
  99: "famicom nes",
  86: "pc engine turbografx tg16",
  64: "sms mark iii",
  78: "mega cd mega-cd",
  130: "switch ns",
  508: "switch 2 ns2",
  33: "gb dmg",
  22: "gbc",
  24: "gba",
  20: "nds ds lite",
  37: "3ds 2ds",
  38: "psp",
  46: "vita psv",
  6: "pc windows computer",
  14: "macintosh apple",
  26: "spectrum speccy sinclair zx",
  373: "sinclair zx81",
  15: "c64 commodore 64 128 c128 cbm",
  71: "vic20 vic 20 commodore",
  16: "amiga commodore a500 a600 a1200",
  25: "cpc amstrad schneider 464 6128",
  69: "bbc micro beeb acorn",
  134: "electron acorn",
  65: "atari 800 800xl 130xe 8-bit",
  63: "atari st ste 520st 1040st",
  75: "apple ii apple 2 iie",
};

export async function consoleOptions(): Promise<ConsoleOption[]> {
  const platforms = await getPlatforms();
  const popular = new Set(POPULAR_CONSOLES);
  return platforms
    .filter(
      (p) =>
        (CONSOLE_TYPES.has(p.category ?? -1) || PCS.has(p.id) || popular.has(p.id) || HANDHELDS.has(p.id) || COMPUTERS.has(p.id)) &&
        !NOT_HOME_COMPUTERS.has(p.id)
    )
    .flatMap((p): ConsoleOption[] => {
      const at = POPULAR_CONSOLES.indexOf(p.id);
      const base = {
        platformId: p.id,
        popular: at >= 0,
        rank: at >= 0 ? at : POPULAR_CONSOLES.length,
        kind: consoleKind(p.id, p.category),
      };
      const words = [p.abbreviation, ALIASES[p.id]].filter(Boolean).join(" ");
      const thumb = (variant: string | null) => {
        const art = consoleArt(p.id, null, variant);
        return art?.kind === "photo" ? art.src : null;
      };
      return CONSOLE_VARIANTS[p.id]
        ? CONSOLE_VARIANTS[p.id].map((v) => ({
            ...base,
            value: `${p.id}:${v.key}`,
            variant: v.key,
            name: v.name,
            search: words,
            thumb: thumb(v.key),
            art: consoleArt(p.id, p.logoImageId, v.key),
          }))
        : [{ ...base, value: String(p.id), variant: null, name: p.name, search: words, thumb: thumb(null), art: consoleArt(p.id, p.logoImageId, null) }];
    });
}

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

  const stops = buildStops(
    (chronicle?.entries ?? []).map((e) => {
      const platform = byId.get(e.platformId);
      return {
        id: e.id,
        platformId: e.platformId,
        variant: e.variant,
        platformName: variantOf(e.platformId, e.variant)?.name ?? platform?.name ?? "Unknown console",
        kind: consoleKind(e.platformId, platform?.category),
        art: consoleArt(e.platformId, platform?.logoImageId, e.variant),
        model: e.model,
        gotAt: e.gotAt,
        gotPrecision: e.gotPrecision,
        age: e.age,
        note: e.note,
        games: e.games.map((g) => g.game),
      };
    }),
    birthYear
  );

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
