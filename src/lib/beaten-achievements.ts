import { prisma } from "./db";
import { getGameSchemaAchievements, mockEnabled } from "./steam";

// Achievements that mean a game is Beaten. Only an admin's confirmation
// makes one count for everyone; a user's own pick counts for their own
// library straight away and shows up in the admin queue as a suggestion.

export type AchievementProvider = "STEAM" | "PSN" | "XBOX";
export const ACHIEVEMENT_PROVIDERS: AchievementProvider[] = ["STEAM", "PSN", "XBOX"];

export const PROVIDER_LABELS: Record<AchievementProvider, string> = {
  STEAM: "Steam",
  PSN: "PlayStation",
  XBOX: "Xbox",
};

export function isAchievementProvider(v: string): v is AchievementProvider {
  return ACHIEVEMENT_PROVIDERS.includes(v as AchievementProvider);
}

// Confirmed mappings for the mock Steam library (STEAM_MOCK=1), seeded when
// a game's achievements are checked. Real mappings come from the admin.
export type SeedBeatenAchievement = {
  provider: AchievementProvider;
  externalGameId: string;
  igdbId?: number;
  achievementKey: string;
  title: string;
  description?: string;
};

const MOCK_BEATEN_ACHIEVEMENTS: SeedBeatenAchievement[] = [
  // Elden Ring (any of the three main endings)
  {
    provider: "STEAM",
    externalGameId: "1245620",
    igdbId: 900002,
    achievementKey: "ACH01_ELDEN_LORD",
    title: "Elden Lord",
    description: "Achieved the \"Elden Lord\" ending",
  },
  {
    provider: "STEAM",
    externalGameId: "1245620",
    igdbId: 900002,
    achievementKey: "ACH02_AGE_OF_STARS",
    title: "Age of the Stars",
    description: "Achieved the \"Age of the Stars\" ending",
  },
  {
    provider: "STEAM",
    externalGameId: "1245620",
    igdbId: 900002,
    achievementKey: "ACH03_FRENZIED_FLAME",
    title: "Lord of Frenzied Flame",
    description: "Achieved the \"Lord of Frenzied Flame\" ending",
  },
];

// Heuristic score for whether an achievement's title/description looks like
// a story / campaign completion achievement, so the UI can surface likely
// candidates at the top of the picker.
export function looksLikeBeatenAchievement(title: string, description?: string | null): boolean {
  const text = `${title} ${description ?? ""}`.toLowerCase();
  if (/\b(100%|all achievements|platinum|every achievement|collect all|unlock all)\b/.test(text)) {
    return false;
  }
  return /\b(complete the (game|story|campaign|main story)|beat the game|finish the (game|story|campaign)|achieved the .* ending|reach the (ending|credits|epilogue)|defeat the final boss|clear a run for the first time)\b/.test(
    text
  );
}

// Ensures the mock library's entries for the given Steam app ids exist in the DB.
export async function ensureBuiltinBeatenAchievements(appIds: number[], igdbIdByAppId?: Map<number, number | null>) {
  if (!mockEnabled()) return;
  const matching = MOCK_BEATEN_ACHIEVEMENTS.filter(
    (b) => b.provider === "STEAM" && appIds.includes(Number(b.externalGameId))
  );
  for (const b of matching) {
    const appId = Number(b.externalGameId);
    const igdbId = igdbIdByAppId?.get(appId) ?? b.igdbId ?? null;
    await prisma.beatenAchievement.upsert({
      where: {
        provider_externalGameId_achievementKey: {
          provider: b.provider,
          externalGameId: b.externalGameId,
          achievementKey: b.achievementKey,
        },
      },
      update: igdbId ? { igdbId } : {},
      create: {
        provider: b.provider,
        externalGameId: b.externalGameId,
        igdbId,
        achievementKey: b.achievementKey,
        title: b.title,
        description: b.description ?? null,
        confirmed: true,
      },
    });
  }
}

export function parseUnlockedMap(json: string | null | undefined): Record<string, number> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
  } catch {
    // ignore malformed JSON
  }
  return {};
}

// Given a user's unlocked achievement map (achievementKey -> unix seconds)
// and the active "beaten" achievement keys for that game, returns the earliest
// unlock date among any matched beaten achievements (OR logic), or null.
export function computeBeatenUnlockAt(
  unlockedMap: Record<string, number>,
  activeKeys: Iterable<string>,
  fallbackDate?: Date | null
): Date | null {
  let earliestSec: number | null = null;
  let matchedWithoutTimestamp = false;
  for (const key of activeKeys) {
    if (Object.prototype.hasOwnProperty.call(unlockedMap, key)) {
      const ts = unlockedMap[key];
      if (typeof ts === "number" && ts > 0) {
        if (earliestSec === null || ts < earliestSec) earliestSec = ts;
      } else {
        matchedWithoutTimestamp = true;
      }
    }
  }
  if (earliestSec !== null) return new Date(earliestSec * 1000);
  if (matchedWithoutTimestamp) return fallbackDate ?? new Date();
  return null;
}

// Returns the set of achievement keys that count as "Beaten" for a given
// user on a provider + externalGameId: any confirmed achievement, or one
// `userId` picked themselves.
export async function getActiveBeatenKeysForGame(
  provider: AchievementProvider,
  externalGameId: string,
  userId?: string
): Promise<Set<string>> {
  const rows = await prisma.beatenAchievement.findMany({
    where: {
      provider,
      externalGameId,
      OR: [
        { confirmed: true },
        ...(userId ? [{ votes: { some: { userId } } }] : []),
      ],
    },
    select: { achievementKey: true },
  });
  return new Set(rows.map((r) => r.achievementKey));
}

// Recomputes `beatenUnlockAt` on stored SteamGame rows for an appId.
// If `onlyUserId` is given, only updates that user's row; otherwise updates
// every user who has that appId in SteamGame (when an admin confirms or
// unconfirms one).
export async function refreshSteamBeatenForApp(appId: number, onlyUserId?: string) {
  const externalGameId = String(appId);
  const allMappings = await prisma.beatenAchievement.findMany({
    where: { provider: "STEAM", externalGameId },
    include: { votes: { select: { userId: true } } },
  });

  const games = await prisma.steamGame.findMany({
    where: { appId, ...(onlyUserId ? { userId: onlyUserId } : {}) },
    select: {
      id: true,
      userId: true,
      unlockedAchievements: true,
      lastUnlockAt: true,
      lastPlayedAt: true,
      state: true,
      importedStatus: true,
      achTotal: true,
      achUnlocked: true,
    },
  });

  for (const g of games) {
    const unlockedMap = parseUnlockedMap(g.unlockedAchievements);
    const activeKeys = allMappings
      .filter(
        (m) => m.confirmed || m.votes.some((v) => v.userId === g.userId)
      )
      .map((m) => m.achievementKey);
    const beatenUnlockAt = computeBeatenUnlockAt(
      unlockedMap,
      activeKeys,
      g.lastUnlockAt ?? g.lastPlayedAt
    );

    // If a game was previously imported as PLAYING or SHELVED and now has a
    // beaten achievement unlocked, reopen it as PENDING so the user can review
    // the upgrade to BEATEN.
    const shouldReopen =
      beatenUnlockAt !== null &&
      (g.state === "IMPORTED" || g.state === "LINKED") &&
      g.importedStatus !== "BEATEN" &&
      g.importedStatus !== "MASTERED";

    await prisma.steamGame.update({
      where: { id: g.id },
      data: {
        beatenUnlockAt,
        ...(shouldReopen ? { state: "PENDING" } : {}),
      },
    });
  }
}

// Admin: confirm an achievement as Beaten for everyone (creating it if
// needed, with Steam's own title and icon), or take that back. Unconfirming
// keeps users' own picks; an unconfirmed row nobody picked is removed.
export async function setBeatenAchievementConfirmed(input: {
  provider: AchievementProvider;
  externalGameId: string;
  achievementKey: string;
  confirmed: boolean;
  title?: string;
  igdbId?: number | null;
}) {
  const { provider, externalGameId, achievementKey, confirmed } = input;
  let title = input.title?.trim() || achievementKey;
  let description: string | null = null;
  let iconUrl: string | null = null;
  let igdbId = input.igdbId ?? null;
  const appId = provider === "STEAM" ? Number(externalGameId) : NaN;
  const isSteamApp = Number.isInteger(appId) && appId > 0;

  if (confirmed && isSteamApp) {
    const found = (await getGameSchemaAchievements(appId)).find((s) => s.key === achievementKey);
    if (found) {
      if (!input.title) title = found.title;
      description = found.description;
      iconUrl = found.iconUrl;
    }
    if (!igdbId) {
      const sg = await prisma.steamGame.findFirst({ where: { appId, igdbId: { not: null } }, select: { igdbId: true } });
      igdbId = sg?.igdbId ?? null;
    }
  }

  const where = { provider_externalGameId_achievementKey: { provider, externalGameId, achievementKey } };
  let row;
  if (confirmed) {
    row = await prisma.beatenAchievement.upsert({
      where,
      update: {
        confirmed: true,
        ...(input.title || description ? { title } : {}),
        ...(description ? { description } : {}),
        ...(iconUrl ? { iconUrl } : {}),
        ...(igdbId ? { igdbId } : {}),
      },
      create: { provider, externalGameId, igdbId, achievementKey, title, description, iconUrl, confirmed: true },
    });
  } else {
    row = await prisma.beatenAchievement.findUnique({ where });
    if (!row) return null;
    row = row.voteCount > 0
      ? await prisma.beatenAchievement.update({ where: { id: row.id }, data: { confirmed: false } })
      : await prisma.beatenAchievement.delete({ where: { id: row.id } });
  }
  if (isSteamApp) await refreshSteamBeatenForApp(appId);
  return row;
}
