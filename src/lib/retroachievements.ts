// Server-side RetroAchievements Web API client
// (https://api-docs.retroachievements.org). Requests use one site-wide key
// (RA_API_KEY); people only give us their public RA username, so nothing of
// theirs is secret. RA_MOCK=1 serves a sample library for offline use.

const API = "https://retroachievements.org/API";
const MEDIA = "https://media.retroachievements.org";
const TIMEOUT_MS = 8000;

export type RaProfile = { username: string; ulid: string | null };

// The RA awards that mean something here: beating a game, and mastering it
// (hardcore mastery or softcore completion both count as 100%).
export type RaAwardKind = "BEATEN" | "MASTERED";

export type RaAwardItem = {
  raGameId: number;
  kind: RaAwardKind;
  hardcore: boolean;
  awardedAt: Date;
  title: string;
  consoleId: number | null;
  consoleName: string | null;
  iconPath: string | null;
};

const mockEnabled = () => process.env.RA_MOCK === "1";

export function raConfigured(): boolean {
  return mockEnabled() || Boolean(process.env.RA_API_KEY);
}

// RA usernames are letters and digits (older accounts may have underscores).
export function isRaUsername(v: string): boolean {
  return /^[A-Za-z0-9_]{2,20}$/.test(v);
}

export function raIconUrl(path: string | null): string | null {
  return path && /^\/Images\/[\w-]+\.png$/.test(path) ? `${MEDIA}${path}` : null;
}

export function raProfileUrl(username: string): string {
  return `https://retroachievements.org/user/${encodeURIComponent(username)}`;
}

export function raGameUrl(raGameId: number): string {
  return `https://retroachievements.org/game/${raGameId}`;
}

class RaNotFound extends Error {}

async function raGet<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ ...params, y: process.env.RA_API_KEY ?? "" });
  const res = await fetch(`${API}/${endpoint}.php?${query}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) throw new RaNotFound();
  if (!res.ok) throw new Error(`RetroAchievements ${endpoint} failed: ${res.status}`);
  return (await res.json()) as T;
}

// The account's canonical name and stable id, or null if there's no such user.
export async function getRaProfile(username: string): Promise<RaProfile | null> {
  if (!isRaUsername(username)) return null;
  if (mockEnabled()) {
    return username.toLowerCase() === "nobody" ? null : { username, ulid: `MOCK${username.toUpperCase()}` };
  }
  try {
    const data = await raGet<{ User?: string; ULID?: string }>("API_GetUserProfile", { u: username });
    return data.User ? { username: data.User, ulid: data.ULID ?? null } : null;
  } catch (e) {
    if (e instanceof RaNotFound) return null;
    throw e;
  }
}

type RawAward = {
  AwardedAt: string;
  AwardType: string;
  AwardData: number;
  AwardDataExtra: number;
  Title: string;
  ConsoleID?: number;
  ConsoleName?: string;
  ImageIcon?: string;
};

function toItem(a: RawAward): RaAwardItem | null {
  const kind: RaAwardKind | null =
    a.AwardType === "Game Beaten" ? "BEATEN" : a.AwardType === "Mastery/Completion" ? "MASTERED" : null;
  const awardedAt = new Date(a.AwardedAt);
  if (!kind || !Number.isInteger(a.AwardData) || isNaN(awardedAt.getTime())) return null;
  return {
    raGameId: a.AwardData,
    kind,
    hardcore: a.AwardDataExtra === 1,
    awardedAt,
    title: String(a.Title ?? "").slice(0, 200),
    consoleId: Number.isInteger(a.ConsoleID) ? a.ConsoleID! : null,
    consoleName: a.ConsoleName ? String(a.ConsoleName).slice(0, 100) : null,
    iconPath: a.ImageIcon ?? null,
  };
}

// Beaten / mastered awards the user hasn't hidden on RA. `who` is the ULID
// when known (survives RA username changes), else the username.
export async function getRaAwards(who: string): Promise<RaAwardItem[]> {
  if (mockEnabled()) return MOCK_AWARDS.map(toItem).filter((a): a is RaAwardItem => a !== null);
  const data = await raGet<{ VisibleUserAwards?: RawAward[] }>("API_GetUserAwards", { u: who });
  return (data.VisibleUserAwards ?? []).map(toItem).filter((a): a is RaAwardItem => a !== null);
}

// Sample library: titles in RA's style ("Legend of Zelda, The: …", hacks,
// subsets) so the matcher's cleanup is exercised against the mock catalog.
const MOCK_AWARDS: RawAward[] = [
  { AwardedAt: "2025-11-02T20:14:00+00:00", AwardType: "Mastery/Completion", AwardData: 355, AwardDataExtra: 1, Title: "Super Metroid", ConsoleID: 3, ConsoleName: "SNES/Super Famicom", ImageIcon: "/Images/066359.png" },
  { AwardedAt: "2025-10-20T18:40:00+00:00", AwardType: "Game Beaten", AwardData: 355, AwardDataExtra: 1, Title: "Super Metroid", ConsoleID: 3, ConsoleName: "SNES/Super Famicom", ImageIcon: "/Images/066359.png" },
  { AwardedAt: "2024-08-11T09:30:00+00:00", AwardType: "Game Beaten", AwardData: 319, AwardDataExtra: 0, Title: "Chrono Trigger", ConsoleID: 3, ConsoleName: "SNES/Super Famicom", ImageIcon: "/Images/050435.png" },
  { AwardedAt: "2024-03-03T21:05:00+00:00", AwardType: "Game Beaten", AwardData: 1, AwardDataExtra: 1, Title: "Sonic the Hedgehog 2", ConsoleID: 1, ConsoleName: "Genesis/Mega Drive", ImageIcon: "/Images/085573.png" },
  { AwardedAt: "2023-12-24T16:00:00+00:00", AwardType: "Mastery/Completion", AwardData: 10024, AwardDataExtra: 1, Title: "Super Mario 64", ConsoleID: 2, ConsoleName: "Nintendo 64", ImageIcon: "/Images/062734.png" },
  { AwardedAt: "2023-06-15T12:00:00+00:00", AwardType: "Game Beaten", AwardData: 1001, AwardDataExtra: 1, Title: "Legend of Zelda, The: Ocarina of Time", ConsoleID: 2, ConsoleName: "Nintendo 64", ImageIcon: "/Images/068171.png" },
  { AwardedAt: "2022-09-01T19:45:00+00:00", AwardType: "Game Beaten", AwardData: 11240, AwardDataExtra: 0, Title: "Final Fantasy VII", ConsoleID: 12, ConsoleName: "PlayStation", ImageIcon: "/Images/060217.png" },
  { AwardedAt: "2022-05-05T10:10:00+00:00", AwardType: "Game Beaten", AwardData: 22222, AwardDataExtra: 1, Title: "~Hack~ Super Metroid: Redesign", ConsoleID: 3, ConsoleName: "SNES/Super Famicom", ImageIcon: "/Images/000001.png" },
  { AwardedAt: "2021-02-14T14:14:00+00:00", AwardType: "Game Beaten", AwardData: 33333, AwardDataExtra: 1, Title: "Metroid Prime [Subset - Bonus]", ConsoleID: 16, ConsoleName: "GameCube", ImageIcon: "/Images/000002.png" },
  { AwardedAt: "2020-07-07T07:07:00+00:00", AwardType: "Game Beaten", AwardData: 44444, AwardDataExtra: 1, Title: "Kirby's Dream Land", ConsoleID: 4, ConsoleName: "Game Boy", ImageIcon: "/Images/000003.png" },
  { AwardedAt: "2020-01-01T00:00:00+00:00", AwardType: "Site Award", AwardData: 5, AwardDataExtra: 0, Title: "Developer", ImageIcon: "/Images/000004.png" },
];
