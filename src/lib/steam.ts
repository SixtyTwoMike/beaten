// Server-side Steam client: "Sign in through Steam" (OpenID 2.0, which only
// tells us the SteamID) and the Steam Web API
// (https://partner.steamgames.com/doc/webapi). Requests use one site-wide key
// (STEAM_API_KEY); nothing of the user's is secret. STEAM_MOCK=1 serves a
// sample library and skips the trip to Steam, for offline use.

const API = "https://api.steampowered.com";
const OPENID = "https://steamcommunity.com/openid/login";
const TIMEOUT_MS = 8000;

export const mockEnabled = () => process.env.STEAM_MOCK === "1";

export function steamConfigured(): boolean {
  return mockEnabled() || Boolean(process.env.STEAM_API_KEY);
}

export function isSteamId(v: string): boolean {
  return /^7656\d{13}$/.test(v);
}

export function steamProfileUrl(steamId: string): string {
  return `https://steamcommunity.com/profiles/${steamId}`;
}

export function steamStoreUrl(appId: number): string {
  return `https://store.steampowered.com/app/${appId}`;
}

// Steam's small store capsule, derivable from the app id.
export function steamCapsuleUrl(appId: number): string {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_184x69.jpg`;
}

// Where to send someone to change "Game details" to Public.
export function steamPrivacyUrl(steamId: string): string {
  return `${steamProfileUrl(steamId)}/edit/settings`;
}

// --- Sign in through Steam -------------------------------------------------

// The URL that sends the user to Steam's own sign-in page; Steam returns them
// to `returnTo` with a signed assertion of their SteamID.
export function steamLoginUrl(returnTo: string, realm: string): string {
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${OPENID}?${params}`;
}

// Checks Steam's response and returns the SteamID it vouches for, or null.
// The assertion is only trusted after Steam itself confirms it
// (check_authentication), and only for our own return_to.
export async function verifySteamLogin(params: URLSearchParams, expectedReturnTo: string): Promise<string | null> {
  if (params.get("openid.mode") !== "id_res") return null;
  if (params.get("openid.op_endpoint") !== OPENID) return null;
  if (params.get("openid.return_to") !== expectedReturnTo) return null;
  const claimed = params.get("openid.claimed_id") ?? "";
  const m = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656\d{13})$/.exec(claimed);
  if (!m || params.get("openid.identity") !== claimed) return null;
  // Every signed field must be present in what we send back.
  const signed = (params.get("openid.signed") ?? "").split(",");
  if (!["claimed_id", "identity", "return_to", "response_nonce", "assoc_handle"].every((f) => signed.includes(f))) {
    return null;
  }

  const body = new URLSearchParams();
  for (const [k, v] of params) if (k.startsWith("openid.")) body.set(k, v);
  body.set("openid.mode", "check_authentication");
  const res = await fetch(OPENID, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const text = await res.text();
  return /(^|\n)is_valid:true(\n|$)/.test(text) ? m[1] : null;
}

// --- Web API -----------------------------------------------------------------

export class SteamPrivate extends Error {}
class SteamNoStats extends Error {}

async function steamGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ ...params, key: process.env.STEAM_API_KEY ?? "", format: "json" });
  const res = await fetch(`${API}/${path}/?${query}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  // GetPlayerAchievements: 403 for private game details, 400 for games
  // without stats.
  if (res.status === 403) throw new SteamPrivate();
  if (res.status === 400) throw new SteamNoStats();
  if (!res.ok) throw new Error(`Steam ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export type SteamProfile = { steamId: string; personaName: string | null; avatarUrl: string | null };

export async function getSteamProfile(steamId: string): Promise<SteamProfile | null> {
  if (mockEnabled()) return { steamId, personaName: "MockSteamPlayer", avatarUrl: null };
  const data = await steamGet<{ response?: { players?: { steamid: string; personaname?: string; avatarfull?: string }[] } }>(
    "ISteamUser/GetPlayerSummaries/v2",
    { steamids: steamId }
  );
  const p = data.response?.players?.[0];
  if (!p) return null;
  const avatar = p.avatarfull && /^https:\/\/avatars\.(steamstatic|akamai\.steamstatic|cloudflare\.steamstatic)\.com\//.test(p.avatarfull) ? p.avatarfull : null;
  return { steamId, personaName: p.personaname?.slice(0, 64) ?? null, avatarUrl: avatar };
}

export type OwnedGame = {
  appId: number;
  name: string;
  playtimeMinutes: number;
  lastPlayedAt: Date | null;
  hasStats: boolean;
};

type RawOwned = {
  appid: number;
  name?: string;
  playtime_forever?: number;
  rtime_last_played?: number;
  has_community_visible_stats?: boolean;
};

function toOwned(g: RawOwned): OwnedGame | null {
  if (!Number.isInteger(g.appid) || g.appid <= 0) return null;
  return {
    appId: g.appid,
    name: String(g.name ?? `App ${g.appid}`).slice(0, 200),
    playtimeMinutes: Math.max(0, Math.floor(g.playtime_forever ?? 0)),
    lastPlayedAt: g.rtime_last_played ? new Date(g.rtime_last_played * 1000) : null,
    hasStats: Boolean(g.has_community_visible_stats),
  };
}

// Owned games, including played free-to-play ones. Throws SteamPrivate
// when "Game details" is private (Steam answers with an empty response).
export async function getOwnedGames(steamId: string): Promise<OwnedGame[]> {
  if (mockEnabled()) return MOCK_OWNED.map(toOwned).filter((g): g is OwnedGame => g !== null);
  const data = await steamGet<{ response?: { game_count?: number; games?: RawOwned[] } }>(
    "IPlayerService/GetOwnedGames/v1",
    { steamid: steamId, include_appinfo: "1", include_played_free_games: "1" }
  );
  if (!data.response || data.response.game_count === undefined) throw new SteamPrivate();
  return (data.response.games ?? []).map(toOwned).filter((g): g is OwnedGame => g !== null);
}

export type WishlistItem = { appId: number; priority: number; addedAt: Date };

// Steam wishlist, in the user's order (priority 1 first; 0 means unranked,
// which Steam lists last). Private wishlists come back empty, so this can't
// tell "private" from "empty".
export async function getWishlist(steamId: string): Promise<WishlistItem[]> {
  type Raw = { appid?: number; priority?: number; date_added?: number };
  const raw: Raw[] = mockEnabled()
    ? MOCK_WISHLIST
    : ((await steamGet<{ response?: { items?: Raw[] } }>("IWishlistService/GetWishlist/v1", { steamid: steamId })).response?.items ?? []);
  return raw
    .flatMap((r) =>
      Number.isInteger(r.appid) && r.appid! > 0
        ? [{ appId: r.appid!, priority: Math.max(0, Math.floor(r.priority ?? 0)), addedAt: new Date((r.date_added ?? 0) * 1000) }]
        : []
    )
    .sort((a, b) => (a.priority || Infinity) - (b.priority || Infinity) || a.addedAt.getTime() - b.addedAt.getTime());
}

export type AchievementSummary = {
  total: number;
  unlocked: number;
  firstUnlockAt: Date | null;
  lastUnlockAt: Date | null;
  // Map of unlocked achievement apiname -> unlock unix timestamp (seconds)
  unlockedMap: Record<string, number>;
};

export type SteamSchemaAchievement = {
  key: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  hidden: boolean;
};

export async function getAchievementSummary(steamId: string, appId: number): Promise<AchievementSummary> {
  if (mockEnabled()) {
    return (
      MOCK_ACHIEVEMENTS[appId] ?? {
        total: 0,
        unlocked: 0,
        firstUnlockAt: null,
        lastUnlockAt: null,
        unlockedMap: {},
      }
    );
  }
  try {
    const data = await steamGet<{
      playerstats?: {
        success?: boolean;
        achievements?: { apiname?: string; achieved?: number; unlocktime?: number }[];
      };
    }>("ISteamUserStats/GetPlayerAchievements/v1", { steamid: steamId, appid: String(appId) });
    const list = data.playerstats?.achievements ?? [];
    const unlockedList = list.filter((a) => a.achieved === 1);
    const times = unlockedList
      .map((a) => a.unlocktime ?? 0)
      .filter((t) => t > 0)
      .sort((a, b) => a - b);
    const unlockedMap: Record<string, number> = {};
    for (const a of unlockedList) {
      if (a.apiname && typeof a.apiname === "string") {
        unlockedMap[a.apiname] = a.unlocktime && a.unlocktime > 0 ? a.unlocktime : 0;
      }
    }
    return {
      total: list.length,
      unlocked: unlockedList.length,
      firstUnlockAt: times.length ? new Date(times[0] * 1000) : null,
      lastUnlockAt: times.length ? new Date(times[times.length - 1] * 1000) : null,
      unlockedMap,
    };
  } catch (e) {
    if (e instanceof SteamNoStats) {
      return { total: 0, unlocked: 0, firstUnlockAt: null, lastUnlockAt: null, unlockedMap: {} };
    }
    throw e;
  }
}

// Fetches the game's achievement definitions (names, descriptions, icons)
// from Steam, so users and admins can pick which achievement(s) mean the
// story/campaign is beaten.
export async function getGameSchemaAchievements(appId: number): Promise<SteamSchemaAchievement[]> {
  if (!Number.isInteger(appId) || appId <= 0) return [];
  if (mockEnabled()) return MOCK_SCHEMA[appId] ?? [];
  if (!process.env.STEAM_API_KEY) return [];
  try {
    const data = await steamGet<{
      game?: {
        availableGameStats?: {
          achievements?: {
            name?: string;
            displayName?: string;
            description?: string;
            icon?: string;
            hidden?: number;
          }[];
        };
      };
    }>("ISteamUserStats/GetSchemaForGame/v2", { appid: String(appId), l: "english" });
    const raw = data.game?.availableGameStats?.achievements ?? [];
    return raw
      .filter((a) => typeof a.name === "string" && a.name.length > 0)
      .map((a) => ({
        key: a.name!.slice(0, 128),
        title: String(a.displayName || a.name!).slice(0, 200),
        description: a.description ? String(a.description).slice(0, 500) : null,
        iconUrl:
          a.icon && /^https:\/\/[\w.-]*steamstatic\.com\//.test(a.icon) ? a.icon : null,
        hidden: a.hidden === 1,
      }));
  } catch (e) {
    if (e instanceof SteamNoStats || e instanceof SteamPrivate) return [];
    console.error("getGameSchemaAchievements failed:", appId, e);
    return [];
  }
}

// --- Mock library ------------------------------------------------------------

const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);

// Real app ids, so the mock IGDB lookup (lib/steam-match.ts) exercises the
// same path; plus a non-game and a barely-played game.
const MOCK_OWNED: RawOwned[] = [
  { appid: 1245620, name: "ELDEN RING", playtime_forever: 7420, rtime_last_played: 1735689600, has_community_visible_stats: true },
  { appid: 1145360, name: "Hades", playtime_forever: 3100, rtime_last_played: now() - 3 * DAY, has_community_visible_stats: true },
  { appid: 367520, name: "Hollow Knight", playtime_forever: 1900, rtime_last_played: 1700000000, has_community_visible_stats: true },
  { appid: 620, name: "Portal 2", playtime_forever: 840, rtime_last_played: 1600000000, has_community_visible_stats: true },
  { appid: 413150, name: "Stardew Valley", playtime_forever: 5200, rtime_last_played: 1680000000, has_community_visible_stats: true },
  { appid: 431960, name: "Wallpaper Engine", playtime_forever: 9000, rtime_last_played: now() - DAY, has_community_visible_stats: false },
  { appid: 504230, name: "Celeste", playtime_forever: 25, rtime_last_played: 1650000000, has_community_visible_stats: true },
  { appid: 292030, name: "The Witcher 3: Wild Hunt", playtime_forever: 0, has_community_visible_stats: true },
];

// Wishlist: three games the mock IGDB knows by app id and one it doesn't.
const MOCK_WISHLIST = [
  { appid: 1593500, priority: 2, date_added: 1700000000 },
  { appid: 570940, priority: 1, date_added: 1690000000 },
  { appid: 220, priority: 0, date_added: 1710000000 },
  { appid: 999999999, priority: 3, date_added: 1700500000 },
];

const at = (t: number) => new Date(t * 1000);
const MOCK_ACHIEVEMENTS: Record<number, AchievementSummary> = {
  1245620: {
    total: 42,
    unlocked: 42,
    firstUnlockAt: at(1646300000),
    lastUnlockAt: at(1660000000),
    unlockedMap: {
      ACH01_ELDEN_LORD: 1655000000,
      ACH02_AGE_OF_STARS: 1658000000,
      ACH03_FRENZIED_FLAME: 1660000000,
    },
  },
  1145360: {
    total: 49,
    unlocked: 20,
    firstUnlockAt: at(now() - 40 * DAY),
    lastUnlockAt: at(now() - 3 * DAY),
    unlockedMap: {
      Clear_01: now() - 20 * DAY,
      Beat_BoneHydra: now() - 35 * DAY,
    },
  },
  367520: {
    total: 63,
    unlocked: 30,
    firstUnlockAt: at(1690000000),
    lastUnlockAt: at(1699000000),
    unlockedMap: {
      FALSE_KNIGHT: 1690000000,
      HORNET_1: 1691000000,
      THE_HOLLOW_KNIGHT: 1698500000,
    },
  },
  620: {
    total: 51,
    unlocked: 19,
    firstUnlockAt: at(1590000000),
    lastUnlockAt: at(1599000000),
    unlockedMap: {
      "ACH.WAKE_UP": 1590000000,
      "ACH.LUNACY": 1599000000,
    },
  },
  413150: {
    total: 40,
    unlocked: 12,
    firstUnlockAt: at(1670000000),
    lastUnlockAt: at(1679000000),
    unlockedMap: {
      GREENHORN: 1670000000,
    },
  },
};

const MOCK_SCHEMA: Record<number, SteamSchemaAchievement[]> = {
  1245620: [
    { key: "ACH01_ELDEN_LORD", title: "Elden Lord", description: "Achieved the \"Elden Lord\" ending", iconUrl: null, hidden: false },
    { key: "ACH02_AGE_OF_STARS", title: "Age of the Stars", description: "Achieved the \"Age of the Stars\" ending", iconUrl: null, hidden: false },
    { key: "ACH03_FRENZIED_FLAME", title: "Lord of Frenzied Flame", description: "Achieved the \"Lord of Frenzied Flame\" ending", iconUrl: null, hidden: false },
  ],
  1145360: [
    { key: "Beat_BoneHydra", title: "Lernaean Might", description: "Slay the Bone Hydra.", iconUrl: null, hidden: false },
    { key: "Clear_01", title: "Is There No Escape?", description: "Clear a run for the first time.", iconUrl: null, hidden: false },
    { key: "End_01", title: "Something From Everyone", description: "Reach the Epilogue.", iconUrl: null, hidden: true },
  ],
  367520: [
    { key: "FALSE_KNIGHT", title: "Falsehood", description: "Defeat the False Knight", iconUrl: null, hidden: false },
    { key: "HORNET_1", title: "Test of Resolve", description: "Defeat Hornet in Greenpath", iconUrl: null, hidden: false },
    { key: "THE_HOLLOW_KNIGHT", title: "The Hollow Knight", description: "Defeat the Hollow Knight and complete the game", iconUrl: null, hidden: false },
    { key: "DREAM_NO_MORE", title: "Dream No More", description: "Defeat the Radiance and consume the light", iconUrl: null, hidden: true },
  ],
  620: [
    { key: "ACH.WAKE_UP", title: "Wake Up Call", description: "Survive the manual override", iconUrl: null, hidden: false },
    { key: "ACH.LUNACY", title: "Lunacy", description: "That just happened", iconUrl: null, hidden: false },
  ],
  413150: [
    { key: "GREENHORN", title: "Greenhorn", description: "Earn 15,000g", iconUrl: null, hidden: false },
    { key: "LOCAL_LEGEND", title: "Local Legend", description: "Restore the Pelican Town Community Center.", iconUrl: null, hidden: false },
  ],
};
