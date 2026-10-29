"use server";

import { revalidatePath } from "next/cache";
import { recordLogActivity } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { ensureGame } from "@/lib/games";
import { findBySteamAppIds } from "@/lib/igdb";
import { isIgdbId } from "@/lib/limits";
import { requireUserId } from "@/lib/session";
import { isPlayStatus, STATUS_RANK, type PlayStatus } from "@/lib/status";
import { SteamPrivate, getAchievementSummary, getOwnedGames } from "@/lib/steam";
import { MIN_MINUTES, importDates, isComplete } from "@/lib/steam-import";
import type { ActionResult } from "./logs";

// Steam import: the account is linked by "Sign in through Steam"
// (app/api/steam), then each sync copies played games into SteamGame rows,
// matches them to IGDB by app id and fetches achievement summaries, and the
// user reviews before anything lands in their diary.

// One sync per account per minute.
const SYNC_COOLDOWN_MS = 60 * 1000;
// Achievement lookups per sync (one Steam call each); the rest follow on
// the next sync, most-played first.
const STATS_BATCH = 60;
const STATS_CONCURRENCY = 4;
// IGDB match lookups per sync (500 app ids per IGDB call).
const MATCH_BATCH = 1500;
const MAX_IMPORT = 300;
// PC (Microsoft Windows) in IGDB.
const PC_PLATFORM = 6;

export type SteamSyncResult = ActionResult & { added?: number; remaining?: number; privateLibrary?: boolean };

export async function syncSteam(): Promise<SteamSyncResult> {
  try {
    const userId = await requireUserId();
    return await sync(userId);
  } catch (e) {
    console.error("syncSteam failed:", e);
    return { ok: false, error: "Couldn't reach Steam — try again shortly" };
  }
}

async function sync(userId: string): Promise<SteamSyncResult> {
  const account = await prisma.steamAccount.findUnique({ where: { userId } });
  if (!account) return { ok: false, error: "Sign in through Steam first" };
  if (account.lastAttemptAt && Date.now() - account.lastAttemptAt.getTime() < SYNC_COOLDOWN_MS) {
    return { ok: false, error: "Synced a moment ago — try again in a minute" };
  }
  await prisma.steamAccount.update({ where: { userId }, data: { lastAttemptAt: new Date() } });

  let owned;
  try {
    owned = await getOwnedGames(account.steamId);
  } catch (e) {
    if (!(e instanceof SteamPrivate)) throw e;
    await prisma.steamAccount.update({ where: { userId }, data: { privateLibrary: true } });
    revalidatePath("/settings");
    return { ok: true, added: 0, remaining: 0, privateLibrary: true };
  }

  const existing = new Map(
    (await prisma.steamGame.findMany({ where: { userId }, select: { appId: true, lastPlayedAt: true, playtimeMinutes: true } })).map(
      (g) => [g.appId, g]
    )
  );
  let added = 0;
  for (const g of owned) {
    if (g.playtimeMinutes === 0) continue;
    const prev = existing.get(g.appId);
    if (!prev) {
      await prisma.steamGame.create({
        data: { userId, appId: g.appId, name: g.name, playtimeMinutes: g.playtimeMinutes, lastPlayedAt: g.lastPlayedAt, hasStats: g.hasStats },
      });
      added++;
    } else if (prev.playtimeMinutes !== g.playtimeMinutes || prev.lastPlayedAt?.getTime() !== g.lastPlayedAt?.getTime()) {
      // Played since: refresh, and look at achievements again.
      await prisma.steamGame.update({
        where: { userId_appId: { userId, appId: g.appId } },
        data: { name: g.name, playtimeMinutes: g.playtimeMinutes, lastPlayedAt: g.lastPlayedAt, hasStats: g.hasStats, statsCheckedAt: null },
      });
    }
  }

  await matchGames(userId);
  await fetchStats(userId, account.steamId);
  await reopenCompleted(userId);

  await prisma.steamAccount.update({ where: { userId }, data: { lastSyncedAt: new Date(), privateLibrary: false } });
  const remaining = await prisma.steamGame.count({ where: { userId, ...NEEDS_STATS } });
  revalidatePath("/settings");
  revalidatePath("/import/steam");
  return { ok: true, added, remaining };
}

async function matchGames(userId: string) {
  const unmatched = await prisma.steamGame.findMany({
    where: { userId, matchCheckedAt: null },
    orderBy: { playtimeMinutes: "desc" },
    take: MATCH_BATCH,
    select: { appId: true },
  });
  for (let i = 0; i < unmatched.length; i += 500) {
    const appIds = unmatched.slice(i, i + 500).map((g) => g.appId);
    const found = await findBySteamAppIds(appIds);
    for (const appId of appIds) {
      const game = found.get(appId);
      await prisma.steamGame.update({
        where: { userId_appId: { userId, appId } },
        data: {
          matchCheckedAt: new Date(),
          igdbId: game?.igdbId ?? null,
          matchName: game?.name ?? null,
          matchCoverUrl: game?.coverUrl ?? null,
          matchYear: game?.releaseYear ?? null,
        },
      });
    }
  }
}

// Played enough to matter, has achievements, and not looked at since it
// was last played.
const NEEDS_STATS = { hasStats: true, statsCheckedAt: null, playtimeMinutes: { gte: MIN_MINUTES }, state: { not: "SKIPPED" } };

async function fetchStats(userId: string, steamId: string) {
  const queue = await prisma.steamGame.findMany({
    where: { userId, ...NEEDS_STATS },
    orderBy: { playtimeMinutes: "desc" },
    take: STATS_BATCH,
    select: { id: true, appId: true },
  });
  let stopped = false;
  async function worker() {
    while (!stopped && queue.length) {
      const g = queue.shift()!;
      try {
        const s = await getAchievementSummary(steamId, g.appId);
        await prisma.steamGame.update({
          where: { id: g.id },
          data: { achTotal: s.total, achUnlocked: s.unlocked, firstUnlockAt: s.firstUnlockAt, lastUnlockAt: s.lastUnlockAt, statsCheckedAt: new Date() },
        });
      } catch (e) {
        // Private game details stop the lot; anything else is retried next sync.
        if (e instanceof SteamPrivate) stopped = true;
        else console.error("Steam achievements failed:", g.appId, e);
      }
    }
  }
  await Promise.all(Array.from({ length: STATS_CONCURRENCY }, worker));
}

// A game imported below Mastered that has since hit 100% comes back for
// review as an upgrade.
async function reopenCompleted(userId: string) {
  const done = await prisma.steamGame.findMany({
    where: { userId, state: { in: ["IMPORTED", "LINKED"] }, importedStatus: { not: "MASTERED" }, achTotal: { gt: 0 } },
  });
  const ids = done.filter(isComplete).map((g) => g.id);
  if (ids.length) await prisma.steamGame.updateMany({ where: { id: { in: ids } }, data: { state: "PENDING" } });
}

// Imports the chosen games, each at the status and IGDB game the user
// settled on. A game already in the diary is upgraded (to Beaten/Mastered)
// or just linked, never duplicated.
export async function importSteamGames(
  selections: { id: string; igdbId: number; status: string }[]
): Promise<ActionResult & { imported?: number; linked?: number; failed?: number }> {
  try {
    const userId = await requireUserId();
    if (!Array.isArray(selections) || selections.length === 0) return { ok: false, error: "Pick at least one game to import" };
    if (selections.length > MAX_IMPORT) return { ok: false, error: "Too many at once — import in smaller batches" };
    if (!selections.every((s) => typeof s?.id === "string" && isIgdbId(s.igdbId) && isPlayStatus(String(s.status)))) {
      return { ok: false, error: "Invalid selection" };
    }
    const chosen = new Map(selections.map((s) => [s.id, s]));
    const rows = await prisma.steamGame.findMany({ where: { userId, state: "PENDING", id: { in: [...chosen.keys()] } } });

    let imported = 0;
    let linked = 0;
    let failed = 0;
    for (const row of rows) {
      const { igdbId } = chosen.get(row.id)!;
      const status = chosen.get(row.id)!.status as PlayStatus;
      const game = await ensureGame(igdbId).catch((e) => {
        console.error("Steam import: game lookup failed:", igdbId, e);
        return null;
      });
      if (!game) {
        failed++;
        continue;
      }
      const dates = importDates(row, status);
      const logs = await prisma.playLog.findMany({ where: { userId, gameId: game.id }, orderBy: { createdAt: "desc" } });

      let playLogId: string;
      let state: "IMPORTED" | "LINKED";
      const finished = status === "BEATEN" || status === "MASTERED";
      const atLeast = logs.find((l) => STATUS_RANK[l.status] >= STATUS_RANK[status]);
      if (atLeast || (logs.length > 0 && !finished)) {
        // Already there at this status or better, or it's only a
        // Playing/Shelved suggestion for a game they've logged.
        playLogId = (atLeast ?? logs[0]).id;
        state = "LINKED";
        linked++;
      } else if (logs.length > 0) {
        const log = logs[0];
        const upgraded = await prisma.playLog.update({
          where: { id: log.id },
          data: {
            status,
            finishedAt: log.finishedAt ?? dates.finishedAt ?? null,
            finishedPrecision: log.finishedAt ? log.finishedPrecision : (dates.finishedPrecision ?? null),
            startedAt: log.startedAt ?? dates.startedAt ?? null,
            startedPrecision: log.startedAt ? log.startedPrecision : null,
            stoppedAt: null,
            stoppedPrecision: null,
            notReturning: false,
          },
        });
        await recordLogActivity(log, upgraded);
        playLogId = log.id;
        state = "IMPORTED";
        imported++;
      } else {
        const platformIds = JSON.parse(game.platformIds) as number[];
        const log = await prisma.playLog.create({
          data: { userId, gameId: game.id, status, ...dates, platformId: platformIds.includes(PC_PLATFORM) ? PC_PLATFORM : null },
        });
        await recordLogActivity(null, log);
        playLogId = log.id;
        state = "IMPORTED";
        imported++;
      }
      await prisma.steamGame.update({ where: { id: row.id }, data: { state, igdbId, playLogId, importedStatus: status } });
    }

    revalidatePath("/", "layout");
    return { ok: true, imported, linked, failed };
  } catch (e) {
    console.error("importSteamGames failed:", e);
    return { ok: false, error: "Something went wrong importing your games" };
  }
}

export async function skipSteamGames(ids: string[]): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    if (!Array.isArray(ids) || ids.length > MAX_IMPORT) return { ok: false, error: "Invalid selection" };
    await prisma.steamGame.updateMany({ where: { userId, state: "PENDING", id: { in: ids.map(String) } }, data: { state: "SKIPPED" } });
    revalidatePath("/import/steam");
    return { ok: true };
  } catch (e) {
    console.error("skipSteamGames failed:", e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function restoreSkippedSteamGames(): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await prisma.steamGame.updateMany({ where: { userId, state: "SKIPPED" }, data: { state: "PENDING" } });
    revalidatePath("/import/steam");
    return { ok: true };
  } catch (e) {
    console.error("restoreSkippedSteamGames failed:", e);
    return { ok: false, error: "Something went wrong" };
  }
}

// Unlinking forgets the SteamID and every game row; diary entries already
// imported stay.
export async function unlinkSteam(): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await prisma.$transaction([
      prisma.steamGame.deleteMany({ where: { userId } }),
      prisma.steamAccount.deleteMany({ where: { userId } }),
    ]);
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    console.error("unlinkSteam failed:", e);
    return { ok: false, error: "Something went wrong unlinking" };
  }
}
