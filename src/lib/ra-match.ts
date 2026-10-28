import { findByAlternativeName, searchGames, type IgdbGame } from "./igdb";
import { titleKey } from "./titles";

// Matches a RetroAchievements game to an IGDB game by title and console.
// HIGH: same title (after cleanup) on the right platform — preselected for
// import. LOW: a plausible guess the user should check. NONE: nothing found.

export type MatchConfidence = "HIGH" | "LOW" | "NONE";
export type Match = { game: IgdbGame | null; confidence: MatchConfidence };

// RA console id → IGDB platform id, for the consoles RA supports that IGDB
// tracks. Only narrows the search; an unmapped console searches everything.
export const RA_TO_IGDB_PLATFORM: Record<number, number> = {
  1: 29, // Genesis/Mega Drive
  2: 4, // Nintendo 64
  3: 19, // SNES/Super Famicom
  4: 33, // Game Boy
  5: 24, // Game Boy Advance
  6: 22, // Game Boy Color
  7: 18, // NES/Famicom
  8: 86, // PC Engine/TurboGrafx-16
  9: 78, // Sega CD
  10: 30, // 32X
  11: 64, // Master System
  12: 7, // PlayStation
  13: 61, // Atari Lynx
  14: 119, // Neo Geo Pocket
  15: 35, // Game Gear
  16: 21, // GameCube
  17: 62, // Atari Jaguar
  18: 20, // Nintendo DS
  21: 8, // PlayStation 2
  25: 59, // Atari 2600
  27: 52, // Arcade
  28: 87, // Virtual Boy
  29: 27, // MSX
  39: 32, // Saturn
  40: 23, // Dreamcast
  41: 38, // PlayStation Portable
  43: 50, // 3DO
  44: 68, // ColecoVision
  45: 67, // Intellivision
  46: 70, // Vectrex
  51: 60, // Atari 7800
  53: 57, // WonderSwan
  78: 159, // Nintendo DSi
};

// RA marks non-retail sets with tildes ("~Hack~ …", "~Homebrew~ …") and
// bonus/challenge sets with "[Subset - …]". Hacks aren't games IGDB knows,
// and finishing a subset isn't finishing the game, so neither is matched.
export function isUnmatchableRaTitle(title: string): boolean {
  return /^~[^~]+~/.test(title.trim()) || /\[Subset/i.test(title);
}

// RA titles → the way IGDB names games: "Legend of Zelda, The: A Link to the
// Past" → "The Legend of Zelda: A Link to the Past"; alternate titles
// ("A | B") reduced to the first.
export function cleanRaTitle(title: string): string {
  let t = title.split(" | ")[0].trim();
  t = t.replace(/^([^:]+?), (The|A|An)(?=:|$| -)/i, "$2 $1");
  return t.replace(/\s{2,}/g, " ").trim();
}

export async function matchRaGame(title: string, consoleId: number | null): Promise<Match> {
  if (isUnmatchableRaTitle(title)) return { game: null, confidence: "NONE" };
  const clean = cleanRaTitle(title);
  if (!clean) return { game: null, confidence: "NONE" };
  const key = titleKey(clean);
  const platformId = consoleId != null ? RA_TO_IGDB_PLATFORM[consoleId] : undefined;

  // Same title (or an alternative title); among several, the most-rated
  // (IGDB has near-empty duplicate entries for some classics).
  const exact = (games: IgdbGame[]) =>
    games
      .filter((g) => [g.name, ...(g.altNames ?? [])].some((n) => titleKey(n) === key))
      .sort((a, b) => (b.ratingCount ?? 0) - (a.ratingCount ?? 0))[0];

  // On the right platform first, then anywhere (ports and re-releases are
  // often filed under another platform on IGDB).
  const onPlatform = platformId ? await searchGames(clean, platformId) : [];
  const hit = exact(onPlatform);
  if (hit) return { game: hit, confidence: "HIGH" };

  const anywhere = await searchGames(clean);
  const anyHit = exact(anywhere);
  if (anyHit) {
    // Same title on an unmapped console is as good as it gets.
    return { game: anyHit, confidence: platformId ? "LOW" : "HIGH" };
  }
  // Japanese / regional titles ("Biohazard 2") that search misses.
  const byAltName = await findByAlternativeName(clean, platformId);
  const altHit = exact(byAltName) ?? byAltName[0];
  if (altHit) return { game: altHit, confidence: platformId ? "HIGH" : "LOW" };

  const guess = onPlatform[0] ?? anywhere[0];
  return guess ? { game: guess, confidence: "LOW" } : { game: null, confidence: "NONE" };
}
