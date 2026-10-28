"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { ensureGame } from "@/lib/games";
import { isIgdbId } from "@/lib/limits";
import { RA_TO_IGDB_PLATFORM, matchRaGame } from "@/lib/ra-match";
import { getRaAwards, getRaProfile, isRaUsername, raConfigured } from "@/lib/retroachievements";
import { requireUserId } from "@/lib/session";
import { STATUS_RANK } from "@/lib/status";
import type { ActionResult } from "./logs";

// RetroAchievements import: link a public RA username, sync its beaten /
// mastered awards into RaAward rows, match each to an IGDB game, and let the
// user review before anything lands in their diary.

// One sync per account per minute: each one calls RA and (for new awards)
// IGDB, both of which rate limit us site-wide.
const SYNC_COOLDOWN_MS = 60 * 1000;
// IGDB lookups per sync; the rest are matched on the next one.
const MATCH_BATCH = 40;
// Most awards one import request may touch.
const MAX_IMPORT = 300;


export type SyncResult = ActionResult & { added?: number; unmatched?: number };

export async function linkRetroAchievements(input: string): Promise<SyncResult> {
  try {
    const userId = await requireUserId();
    if (!raConfigured()) return { ok: false, error: "RetroAchievements isn't set up on this site yet" };
    const username = String(input ?? "").trim();
    if (!isRaUsername(username)) return { ok: false, error: "Enter your RetroAchievements username" };
    const profile = await getRaProfile(username);
    if (!profile) return { ok: false, error: "No RetroAchievements user by that name" };
    // Switching to a different RA account drops the old one's awards.
    const previous = await prisma.raAccount.findUnique({ where: { userId } });
    if (previous && (previous.raUlid ?? previous.raUsername) !== (profile.ulid ?? profile.username)) {
      await prisma.raAward.deleteMany({ where: { userId } });
      await prisma.raAccount.update({ where: { userId }, data: { lastAttemptAt: null } });
    }
    await prisma.raAccount.upsert({
      where: { userId },
      update: { raUsername: profile.username, raUlid: profile.ulid },
      create: { userId, raUsername: profile.username, raUlid: profile.ulid },
    });
    return await sync(userId);
  } catch (e) {
    console.error("linkRetroAchievements failed:", e);
    return { ok: false, error: "Couldn't reach RetroAchievements — try again shortly" };
  }
}

export async function syncRetroAchievements(): Promise<SyncResult> {
  try {
    const userId = await requireUserId();
    return await sync(userId);
  } catch (e) {
    console.error("syncRetroAchievements failed:", e);
    return { ok: false, error: "Couldn't reach RetroAchievements — try again shortly" };
  }
}

async function sync(userId: string): Promise<SyncResult> {
  const account = await prisma.raAccount.findUnique({ where: { userId } });
  if (!account) return { ok: false, error: "Link your RetroAchievements account first" };
  if (account.lastAttemptAt && Date.now() - account.lastAttemptAt.getTime() < SYNC_COOLDOWN_MS) {
    return { ok: false, error: "Synced a moment ago — try again in a minute" };
  }
  await prisma.raAccount.update({ where: { userId }, data: { lastAttemptAt: new Date() } });

  const awards = await getRaAwards(account.raUlid ?? account.raUsername);
  const known = new Set(
    (await prisma.raAward.findMany({ where: { userId }, select: { raGameId: true, kind: true } })).map(
      (a) => `${a.raGameId}:${a.kind}`
    )
  );
  const fresh = awards.filter((a) => !known.has(`${a.raGameId}:${a.kind}`));
  for (const a of fresh) {
    await prisma.raAward.upsert({
      where: { userId_raGameId_kind: { userId, raGameId: a.raGameId, kind: a.kind } },
      update: {},
      create: {
        userId,
        raGameId: a.raGameId,
        kind: a.kind,
        hardcore: a.hardcore,
        awardedAt: a.awardedAt,
        title: a.title,
        consoleId: a.consoleId,
        consoleName: a.consoleName,
        iconPath: a.iconPath,
      },
    });
  }

  await matchPending(userId);
  await prisma.raAccount.update({ where: { userId }, data: { lastSyncedAt: new Date() } });
  const unmatched = await prisma.raAward.count({
    where: { userId, state: "PENDING", matchConfidence: null },
  });
  revalidatePath("/settings");
  revalidatePath("/import/retroachievements");
  return { ok: true, added: fresh.length, unmatched };
}

// Matches pending awards that haven't been looked at yet. Both awards for a
// game (beaten + mastered) share one lookup.
async function matchPending(userId: string) {
  const pending = await prisma.raAward.findMany({
    where: { userId, state: "PENDING", matchConfidence: null },
    orderBy: { awardedAt: "desc" },
  });
  const byGame = new Map<number, typeof pending>();
  for (const a of pending) byGame.set(a.raGameId, [...(byGame.get(a.raGameId) ?? []), a]);

  let lookups = 0;
  for (const [raGameId, rows] of byGame) {
    if (lookups >= MATCH_BATCH) break;
    // Up to 3 IGDB requests per lookup; IGDB allows 4 per second.
    if (lookups > 0) await new Promise((r) => setTimeout(r, 800));
    lookups++;
    const match = await matchRaGame(rows[0].title, rows[0].consoleId).catch((e) => {
      console.error("RA match failed:", e);
      return null;
    });
    if (!match) continue;
    await prisma.raAward.updateMany({
      where: { userId, raGameId, state: "PENDING" },
      data: {
        igdbId: match.game?.igdbId ?? null,
        matchConfidence: match.confidence,
        matchName: match.game?.name ?? null,
        matchCoverUrl: match.game?.coverUrl ?? null,
        matchYear: match.game?.releaseYear ?? null,
      },
    });
  }
}

// Imports the chosen awards. Each selection may override the matched game.
// Awards for the same game collapse into one diary entry at the highest
// status, dated by that award; a game already in the diary is upgraded
// (Playing/Beaten → Mastered) or just linked, never duplicated.
export async function importRetroAchievements(
  selections: { awardId: string; igdbId: number }[]
): Promise<ActionResult & { imported?: number; linked?: number; failed?: number }> {
  try {
    const userId = await requireUserId();
    if (!Array.isArray(selections) || selections.length === 0) {
      return { ok: false, error: "Pick at least one game to import" };
    }
    if (selections.length > MAX_IMPORT) return { ok: false, error: "Too many at once — import in smaller batches" };
    if (!selections.every((s) => typeof s?.awardId === "string" && isIgdbId(s.igdbId))) {
      return { ok: false, error: "Invalid selection" };
    }

    const awards = await prisma.raAward.findMany({
      where: { userId, state: "PENDING", id: { in: selections.map((s) => s.awardId) } },
    });
    const chosen = new Map(selections.map((s) => [s.awardId, s.igdbId]));

    // Group by target game, keeping the highest award (latest on a tie).
    const byGame = new Map<number, typeof awards>();
    for (const a of awards) {
      const igdbId = chosen.get(a.id)!;
      byGame.set(igdbId, [...(byGame.get(igdbId) ?? []), a]);
    }

    let imported = 0;
    let linked = 0;
    let failed = 0;
    for (const [igdbId, rows] of byGame) {
      const top = rows.reduce((best, a) =>
        STATUS_RANK[a.kind] > STATUS_RANK[best.kind] || (STATUS_RANK[a.kind] === STATUS_RANK[best.kind] && a.awardedAt > best.awardedAt) ? a : best
      );
      // A game IGDB can't return (removed, or a bad id) stays pending.
      const game = await ensureGame(igdbId).catch((e) => {
        console.error("RA import: game lookup failed:", igdbId, e);
        return null;
      });
      if (!game) {
        failed++;
        continue;
      }
      const finishedAt = new Date(
        Date.UTC(top.awardedAt.getUTCFullYear(), top.awardedAt.getUTCMonth(), top.awardedAt.getUTCDate())
      );
      const logs = await prisma.playLog.findMany({
        where: { userId, gameId: game.id },
        orderBy: { createdAt: "desc" },
      });

      let playLogId: string;
      let state: "IMPORTED" | "LINKED";
      const atLeast = logs.find((l) => STATUS_RANK[l.status] >= STATUS_RANK[top.kind]);
      if (atLeast) {
        playLogId = atLeast.id;
        state = "LINKED";
        linked++;
      } else if (logs.length > 0) {
        // Upgrade the latest entry (Playing/Shelved → Beaten, Beaten → Mastered).
        const log = logs[0];
        await prisma.playLog.update({
          where: { id: log.id },
          data: { status: top.kind, finishedAt: log.finishedAt ?? finishedAt, stoppedAt: null, notReturning: false },
        });
        playLogId = log.id;
        state = "IMPORTED";
        imported++;
      } else {
        const mapped = top.consoleId != null ? RA_TO_IGDB_PLATFORM[top.consoleId] : undefined;
        const platformIds = JSON.parse(game.platformIds) as number[];
        const log = await prisma.playLog.create({
          data: {
            userId,
            gameId: game.id,
            status: top.kind,
            finishedAt,
            platformId: mapped && platformIds.includes(mapped) ? mapped : null,
          },
        });
        playLogId = log.id;
        state = "IMPORTED";
        imported++;
      }
      await prisma.raAward.updateMany({
        where: { userId, id: { in: rows.map((r) => r.id) } },
        data: { state, igdbId, playLogId },
      });
    }

    revalidatePath("/", "layout");
    return { ok: true, imported, linked, failed };
  } catch (e) {
    console.error("importRetroAchievements failed:", e);
    return { ok: false, error: "Something went wrong importing your games" };
  }
}

export async function skipRetroAchievements(awardIds: string[]): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    if (!Array.isArray(awardIds) || awardIds.length > MAX_IMPORT) return { ok: false, error: "Invalid selection" };
    await prisma.raAward.updateMany({
      where: { userId, state: "PENDING", id: { in: awardIds.map(String) } },
      data: { state: "SKIPPED" },
    });
    revalidatePath("/import/retroachievements");
    return { ok: true };
  } catch (e) {
    console.error("skipRetroAchievements failed:", e);
    return { ok: false, error: "Something went wrong" };
  }
}

// Skipped awards go back to the review list.
export async function restoreSkippedRetroAchievements(): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await prisma.raAward.updateMany({ where: { userId, state: "SKIPPED" }, data: { state: "PENDING" } });
    revalidatePath("/import/retroachievements");
    return { ok: true };
  } catch (e) {
    console.error("restoreSkippedRetroAchievements failed:", e);
    return { ok: false, error: "Something went wrong" };
  }
}

// Unlinking forgets the account and every award row; diary entries already
// imported stay (they're the user's now).
export async function unlinkRetroAchievements(): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await prisma.$transaction([
      prisma.raAward.deleteMany({ where: { userId } }),
      prisma.raAccount.deleteMany({ where: { userId } }),
    ]);
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    console.error("unlinkRetroAchievements failed:", e);
    return { ok: false, error: "Something went wrong unlinking" };
  }
}
