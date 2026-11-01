"use server";

import { revalidatePath } from "next/cache";
import {
  type AchievementProvider,
  ensureBuiltinBeatenAchievements,
  isAchievementProvider,
  looksLikeBeatenAchievement,
  parseUnlockedMap,
  refreshSteamBeatenForApp,
} from "@/lib/beaten-achievements";
import { prisma } from "@/lib/db";
import { isIgdbId } from "@/lib/limits";
import { requireUserId } from "@/lib/session";
import { getGameSchemaAchievements } from "@/lib/steam";
import type { ActionResult } from "./logs";

export type AchievementCandidate = {
  key: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  hidden: boolean;
  unlockedAt: string | null; // ISO string if the current user unlocked it
  confirmed: boolean;
  voteCount: number;
  votedByMe: boolean;
  activeForMe: boolean;
  suggestedByHeuristic: boolean;
};

// Loads the list of achievements for a Steam game, enriched with the
// current user's unlock timestamps and community/curated "beaten" status.
export async function getSteamAchievementsForPicker(
  appId: number,
  igdbId?: number | null
): Promise<ActionResult & { achievements?: AchievementCandidate[] }> {
  try {
    const userId = await requireUserId();
    if (!Number.isInteger(appId) || appId <= 0) {
      return { ok: false, error: "Invalid Steam app ID" };
    }
    await ensureBuiltinBeatenAchievements([appId], igdbId ? new Map([[appId, igdbId]]) : undefined);

    const [schema, steamGame, existing] = await Promise.all([
      getGameSchemaAchievements(appId),
      prisma.steamGame.findUnique({
        where: { userId_appId: { userId, appId } },
        select: { unlockedAchievements: true },
      }),
      prisma.beatenAchievement.findMany({
        where: { provider: "STEAM", externalGameId: String(appId) },
        include: { votes: { where: { userId }, select: { userId: true } } },
      }),
    ]);

    const unlockedMap = parseUnlockedMap(steamGame?.unlockedAchievements);
    const byKey = new Map(existing.map((e) => [e.achievementKey, e]));

    // Merge schema achievements with any already-recorded beaten achievements
    // (in case the Steam schema call failed or is offline).
    const keysSeen = new Set<string>();
    const list: AchievementCandidate[] = [];

    for (const s of schema) {
      keysSeen.add(s.key);
      const rec = byKey.get(s.key);
      const unlockTs = unlockedMap[s.key];
      const votedByMe = Boolean(rec && rec.votes.length > 0);
      const confirmed = Boolean(rec?.confirmed);
      const voteCount = rec?.voteCount ?? 0;
      list.push({
        key: s.key,
        title: s.title,
        description: s.description,
        iconUrl: s.iconUrl,
        hidden: s.hidden,
        unlockedAt: typeof unlockTs === "number" && unlockTs > 0 ? new Date(unlockTs * 1000).toISOString() : null,
        confirmed,
        voteCount,
        votedByMe,
        activeForMe: confirmed || votedByMe,
        suggestedByHeuristic: looksLikeBeatenAchievement(s.title, s.description),
      });
    }

    for (const rec of existing) {
      if (keysSeen.has(rec.achievementKey)) continue;
      const unlockTs = unlockedMap[rec.achievementKey];
      const votedByMe = rec.votes.length > 0;
      list.push({
        key: rec.achievementKey,
        title: rec.title,
        description: rec.description,
        iconUrl: rec.iconUrl,
        hidden: false,
        unlockedAt: typeof unlockTs === "number" && unlockTs > 0 ? new Date(unlockTs * 1000).toISOString() : null,
        confirmed: rec.confirmed,
        voteCount: rec.voteCount,
        votedByMe,
        activeForMe: rec.confirmed || votedByMe,
        suggestedByHeuristic: looksLikeBeatenAchievement(rec.title, rec.description),
      });
    }

    // Sort: active beaten achievements first, then heuristic suggestions,
    // then ones the user has unlocked, then original order.
    list.sort((a, b) => {
      if (a.activeForMe !== b.activeForMe) return a.activeForMe ? -1 : 1;
      if (a.suggestedByHeuristic !== b.suggestedByHeuristic) return a.suggestedByHeuristic ? -1 : 1;
      const aUnlocked = a.unlockedAt !== null;
      const bUnlocked = b.unlockedAt !== null;
      if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;
      return 0;
    });

    return { ok: true, achievements: list };
  } catch (e) {
    console.error("getSteamAchievementsForPicker failed:", e);
    return { ok: false, error: "Couldn't load achievements for this game" };
  }
}

// Toggles the current user's pick of an achievement as meaning "Beaten"
// (story/campaign completed). It applies to their own library at once and
// joins the admin's queue as a suggestion; only an admin makes it count for
// everyone.
export async function toggleBeatenAchievementVote(input: {
  provider: AchievementProvider;
  externalGameId: string;
  igdbId?: number | null;
  achievementKey: string;
  title?: string;
  description?: string | null;
  iconUrl?: string | null;
}): Promise<ActionResult & { voted?: boolean; voteCount?: number; confirmed?: boolean }> {
  try {
    const userId = await requireUserId();
    const provider = String(input.provider ?? "");
    if (!isAchievementProvider(provider)) return { ok: false, error: "Invalid achievement provider" };
    const externalGameId = String(input.externalGameId ?? "").trim().slice(0, 64);
    const achievementKey = String(input.achievementKey ?? "").trim().slice(0, 128);
    if (!externalGameId || !achievementKey) return { ok: false, error: "Invalid achievement" };
    const igdbId = input.igdbId && isIgdbId(input.igdbId) ? input.igdbId : null;

    // For Steam, verify or enrich metadata from the game's schema when available.
    let title = String(input.title ?? achievementKey).trim().slice(0, 200) || achievementKey;
    let description = input.description ? String(input.description).trim().slice(0, 500) : null;
    let iconUrl =
      input.iconUrl && /^https:\/\/[\w.-]*steamstatic\.com\//.test(input.iconUrl) ? input.iconUrl : null;

    if (provider === "STEAM") {
      const appId = Number(externalGameId);
      if (!Number.isInteger(appId) || appId <= 0) return { ok: false, error: "Invalid Steam app ID" };
      const schema = await getGameSchemaAchievements(appId);
      const found = schema.find((s) => s.key === achievementKey);
      if (found) {
        title = found.title;
        description = found.description;
        iconUrl = found.iconUrl;
      }
    }

    const record = await prisma.beatenAchievement.upsert({
      where: {
        provider_externalGameId_achievementKey: {
          provider,
          externalGameId,
          achievementKey,
        },
      },
      update: {
        ...(igdbId ? { igdbId } : {}),
        title,
        description,
        iconUrl,
      },
      create: {
        provider,
        externalGameId,
        igdbId,
        achievementKey,
        title,
        description,
        iconUrl,
        voteCount: 0,
      },
    });

    const existingVote = await prisma.beatenAchievementVote.findUnique({
      where: { achievementId_userId: { achievementId: record.id, userId } },
    });

    let voted: boolean;
    let newCount: number;

    if (existingVote) {
      await prisma.beatenAchievementVote.delete({
        where: { achievementId_userId: { achievementId: record.id, userId } },
      });
      newCount = await prisma.beatenAchievementVote.count({ where: { achievementId: record.id } });
      await prisma.beatenAchievement.update({
        where: { id: record.id },
        data: { voteCount: newCount },
      });
      voted = false;
    } else {
      await prisma.beatenAchievementVote.create({
        data: { achievementId: record.id, userId },
      });
      newCount = await prisma.beatenAchievementVote.count({ where: { achievementId: record.id } });
      await prisma.beatenAchievement.update({
        where: { id: record.id },
        data: { voteCount: newCount },
      });
      voted = true;
    }

    if (provider === "STEAM") await refreshSteamBeatenForApp(Number(externalGameId), userId);

    revalidatePath("/import/steam");
    if (igdbId ?? record.igdbId) {
      revalidatePath(`/games/${igdbId ?? record.igdbId}`);
    }
    return { ok: true, voted, voteCount: newCount, confirmed: record.confirmed };
  } catch (e) {
    console.error("toggleBeatenAchievementVote failed:", e);
    return { ok: false, error: "Something went wrong saving that achievement" };
  }
}
