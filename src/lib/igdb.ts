// Server-side IGDB client. IGDB is accessed with Twitch client-credentials
// OAuth (https://api-docs.igdb.com). When TWITCH_CLIENT_ID/SECRET are not set,
// IGDB_MOCK=1 serves a built-in sample catalog so the app is usable offline.

import { mockPlatforms, mockSearch, mockGetGame } from "./igdb-mock";
import { titleKey } from "./titles";

export type IgdbGame = {
  igdbId: number;
  name: string;
  slug: string | null;
  coverUrl: string | null;
  artworkUrl: string | null;
  releaseYear: number | null;
  summary: string | null;
  platformIds: number[];
  // Search-only extras (absent from mock data and cached Game rows).
  ratingCount?: number;
  altNames?: string[];
};

export type IgdbPlatform = {
  id: number;
  name: string;
  abbreviation: string | null;
  generation: number | null;
  category: number | null;
};

const mockEnabled = () => process.env.IGDB_MOCK === "1";

export function igdbConfigured(): boolean {
  return (
    mockEnabled() ||
    Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET)
  );
}

// Fail fast when Twitch/IGDB stall, so pages fall back to the local cache
// instead of hanging until nginx gives up.
const IGDB_TIMEOUT_MS = 5000;

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getTwitchToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID!,
    client_secret: process.env.TWITCH_CLIENT_SECRET!,
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, {
    method: "POST",
    signal: AbortSignal.timeout(IGDB_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Twitch token request failed: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function igdbQuery<T>(endpoint: string, body: string): Promise<T[]> {
  const token = await getTwitchToken();
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": process.env.TWITCH_CLIENT_ID!,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(IGDB_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`IGDB ${endpoint} request failed: ${res.status}`);
  }
  return (await res.json()) as T[];
}

type RawGame = {
  id: number;
  name: string;
  slug?: string;
  summary?: string;
  first_release_date?: number;
  platforms?: number[];
  cover?: { image_id?: string };
  artworks?: { image_id?: string }[];
  screenshots?: { image_id?: string }[];
  game_type?: number;
  version_parent?: number;
  parent_game?: number;
  total_rating_count?: number;
  hypes?: number;
  alternative_names?: { name?: string }[];
};

export function coverUrlFromImageId(imageId: string | undefined): string | null {
  return imageId
    ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`
    : null;
}

function artworkUrlFromRaw(raw: RawGame): string | null {
  const imageId =
    raw.artworks?.find((a) => a.image_id)?.image_id ??
    raw.screenshots?.find((s) => s.image_id)?.image_id;
  return imageId
    ? `https://images.igdb.com/igdb/image/upload/t_screenshot_huge/${imageId}.jpg`
    : null;
}

function toIgdbGame(raw: RawGame): IgdbGame {
  return {
    igdbId: raw.id,
    name: raw.name,
    slug: raw.slug ?? null,
    coverUrl: coverUrlFromImageId(raw.cover?.image_id),
    artworkUrl: artworkUrlFromRaw(raw),
    releaseYear: raw.first_release_date
      ? new Date(raw.first_release_date * 1000).getUTCFullYear()
      : null,
    summary: raw.summary ?? null,
    platformIds: raw.platforms ?? [],
    ratingCount: (raw.total_rating_count ?? 0) + (raw.hypes ?? 0),
    altNames: (raw.alternative_names ?? []).flatMap((a) => (a.name ? [a.name] : [])),
  };
}

const GAME_FIELDS =
  "fields name,slug,summary,first_release_date,platforms,cover.image_id," +
  "artworks.image_id,screenshots.image_id," +
  "game_type,version_parent,parent_game,total_rating_count,hypes,alternative_names.name;";

// Things you can log, for search and matching. game_type ids (POST
// /v4/game_types): 0 main game, 2 expansion, 4 standalone expansion,
// 8 remake, 9 remaster, 10 expanded game, 11 port. Left out: DLC, bundles,
// mods, episodes, seasons, forks, packs, updates, editions (version_parent
// set), and cancelled/rumoured games. ("category" was removed by IGDB; a
// filter on it silently matches nothing.) With `search`, a bare
// `game_status != …` also drops games whose status is null (most released
// games), hence the null-safe form.
const LOGGABLE =
  "game_type = (0,2,4,8,9,10,11) & version_parent = null & (game_status = null | game_status != (6,7))";

// IGDB can't sort a `search` (406), so results are re-ranked here: name
// match first, then popularity; expansions and ports after the main game;
// ports dropped when their original is also in the results.
function rerank(raw: RawGame[], query: string): RawGame[] {
  const q = titleKey(query);
  const qWords = q.split(" ");
  const ids = new Set(raw.map((g) => g.id));
  const pool = raw.filter((g) => !(g.game_type === 11 && g.parent_game && ids.has(g.parent_game)));
  const score = (g: RawGame, i: number) => {
    const n = titleKey(g.name);
    let s = -i; // IGDB's relevance order breaks ties
    if (n === q) s += 150;
    else if (n.startsWith(q + " ")) s += 60;
    const words = new Set(n.split(" "));
    if (qWords.every((w) => words.has(w))) s += 40;
    s += 60 * Math.log10(1 + (g.total_rating_count ?? 0) + (g.hypes ?? 0));
    if (g.game_type === 2) s -= 40;
    if (g.game_type === 11) s -= 60;
    if (!g.first_release_date) s -= 120; // homebrew, vapourware, TBA
    return s;
  };
  return pool
    .map((g, i) => [g, score(g, i)] as const)
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g);
}

export async function searchGames(
  query: string,
  platformId?: number
): Promise<IgdbGame[]> {
  if (mockEnabled()) return mockSearch(query, platformId);
  const escaped = query.replace(/(["\\])/g, "\\$1");
  const onPlatform = platformId ? ` & platforms = (${platformId})` : "";
  let raw = await igdbQuery<RawGame>(
    "games",
    `search "${escaped}"; ${GAME_FIELDS} where ${LOGGABLE}${onPlatform}; limit 50;`
  );
  if (raw.length === 0) {
    // Nothing loggable: maybe they're after an edition or DLC by name.
    const where = platformId ? `where platforms = (${platformId});` : "";
    raw = await igdbQuery<RawGame>("games", `search "${escaped}"; ${GAME_FIELDS} ${where} limit 24;`);
  }
  return rerank(raw, query).slice(0, 24).map(toIgdbGame);
}

// Exact (case-insensitive) lookup by alternative or localized title, e.g.
// "Biohazard 2" or "Pocket Monsters Midori", which `search` often misses.
export async function findByAlternativeName(name: string, platformId?: number): Promise<IgdbGame[]> {
  if (mockEnabled()) return [];
  const escaped = name.replace(/(["\\])/g, "\\$1");
  const onPlatform = platformId ? ` & platforms = (${platformId})` : "";
  const raw = await igdbQuery<RawGame>(
    "games",
    `${GAME_FIELDS} where (alternative_names.name ~ "${escaped}" | game_localizations.name ~ "${escaped}")` +
      ` & ${LOGGABLE}${onPlatform}; limit 10;`
  );
  return raw.map(toIgdbGame);
}

export async function getGame(igdbId: number): Promise<IgdbGame | null> {
  if (mockEnabled()) return mockGetGame(igdbId);
  const raw = await igdbQuery<RawGame>(
    "games",
    `${GAME_FIELDS} where id = ${igdbId}; limit 1;`
  );
  return raw.length ? toIgdbGame(raw[0]) : null;
}

export async function fetchPlatforms(): Promise<IgdbPlatform[]> {
  if (mockEnabled()) return mockPlatforms;
  type RawPlatform = {
    id: number;
    name: string;
    abbreviation?: string;
    generation?: number;
    platform_type?: number;
  };
  // IGDB replaced platform "category" with "platform_type" (same ids); it's
  // stored in the existing category column.
  const raw = await igdbQuery<RawPlatform>(
    "platforms",
    "fields name,abbreviation,generation,platform_type; limit 500; sort name asc;"
  );
  return raw.map((p) => ({
    id: p.id,
    name: p.name,
    abbreviation: p.abbreviation ?? null,
    generation: p.generation ?? null,
    category: p.platform_type ?? null,
  }));
}

// Popular games released in the past year, for the landing page showcase.
// Cached in memory for 12 hours; an IGDB failure yields an empty list.
const SHOWCASE_TTL_MS = 12 * 60 * 60 * 1000;
let showcaseCache: { games: IgdbGame[]; expiresAt: number } | null = null;

export async function recentPopularGames(limit = 12): Promise<IgdbGame[]> {
  if (mockEnabled()) return mockSearch("").slice(0, limit);
  if (!igdbConfigured()) return [];
  if (showcaseCache && showcaseCache.expiresAt > Date.now()) {
    return showcaseCache.games.slice(0, limit);
  }
  const now = Math.floor(Date.now() / 1000);
  const yearAgo = now - 365 * 24 * 60 * 60;
  try {
    const raw = await igdbQuery<RawGame>(
      "games",
      `${GAME_FIELDS} where first_release_date > ${yearAgo} & first_release_date < ${now}` +
        ` & cover != null & version_parent = null & game_type = (0,4,8,9,10)` +
        ` & (themes = null | themes != (42)) & total_rating_count > 3;` +
        ` sort total_rating_count desc; limit 24;`
    );
    const games = raw.map(toIgdbGame).filter((g) => g.coverUrl);
    showcaseCache = { games, expiresAt: Date.now() + SHOWCASE_TTL_MS };
    return games.slice(0, limit);
  } catch (e) {
    console.error("recentPopularGames failed:", e);
    return [];
  }
}
