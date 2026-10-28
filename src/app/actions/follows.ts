"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { BLOCK_LIMIT, FOLLOW_LIMIT, MAX_FOLLOWING, canSocialise } from "@/lib/follows";
import { TOO_MANY_ATTEMPTS, isLimited, recordAttempt } from "@/lib/rate-limit";
import { requireUserId } from "@/lib/session";
import { normalizeUsername } from "@/lib/username";
import type { ActionResult } from "./logs";

// Follow, unfollow, block, unblock. Targets are given by username only (never
// ids); a missing account, yourself, or a block either way all get the same
// answer, so nothing extra is revealed.

const CANT_FOLLOW = "You can't follow this account";

async function me(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, emailVerifiedAt: true } });
}

async function target(username: unknown) {
  const handle = normalizeUsername(String(username ?? "")).slice(0, 30);
  if (!handle) return null;
  return prisma.user.findUnique({ where: { username: handle }, select: { id: true, username: true, emailVerifiedAt: true } });
}

function revalidate(...usernames: (string | null | undefined)[]) {
  for (const u of usernames) if (u) revalidatePath(`/${u}`);
  revalidatePath("/", "layout");
}

export async function followUser(username: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const self = await me(userId);
    if (!canSocialise(self)) return { ok: false, error: "Choose a username in Settings to follow people" };
    if (isLimited(`follow:${userId}`, FOLLOW_LIMIT)) return { ok: false, error: TOO_MANY_ATTEMPTS };
    const other = await target(username);
    if (!other || other.id === userId || !canSocialise(other)) return { ok: false, error: CANT_FOLLOW };
    const blocked = await prisma.block.count({
      where: { OR: [{ blockerId: userId, blockedId: other.id }, { blockerId: other.id, blockedId: userId }] },
    });
    if (blocked) return { ok: false, error: CANT_FOLLOW };
    if ((await prisma.follow.count({ where: { followerId: userId } })) >= MAX_FOLLOWING) {
      return { ok: false, error: `You can follow up to ${MAX_FOLLOWING} people` };
    }
    recordAttempt(`follow:${userId}`, FOLLOW_LIMIT);
    await prisma.follow.upsert({
      where: { followerId_followeeId: { followerId: userId, followeeId: other.id } },
      update: {},
      create: { followerId: userId, followeeId: other.id },
    });
    revalidate(self!.username, other.username);
    return { ok: true };
  } catch (e) {
    console.error("followUser failed:", e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function unfollowUser(username: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const other = await target(username);
    if (other) await prisma.follow.deleteMany({ where: { followerId: userId, followeeId: other.id } });
    const self = await me(userId);
    revalidate(self?.username, other?.username);
    return { ok: true };
  } catch (e) {
    console.error("unfollowUser failed:", e);
    return { ok: false, error: "Something went wrong" };
  }
}

// Ends follows both ways and stops new ones; each disappears from the other's
// feed and friend lists. Their public profile stays public.
export async function blockUser(username: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    if (isLimited(`block:${userId}`, BLOCK_LIMIT)) return { ok: false, error: TOO_MANY_ATTEMPTS };
    const other = await target(username);
    if (!other || other.id === userId) return { ok: false, error: "Couldn't block this account" };
    recordAttempt(`block:${userId}`, BLOCK_LIMIT);
    await prisma.$transaction([
      prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: other.id } },
        update: {},
        create: { blockerId: userId, blockedId: other.id },
      }),
      prisma.follow.deleteMany({
        where: { OR: [{ followerId: userId, followeeId: other.id }, { followerId: other.id, followeeId: userId }] },
      }),
    ]);
    const self = await me(userId);
    revalidate(self?.username, other.username);
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    console.error("blockUser failed:", e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function unblockUser(username: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const other = await target(username);
    if (other) await prisma.block.deleteMany({ where: { blockerId: userId, blockedId: other.id } });
    revalidate(other?.username);
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    console.error("unblockUser failed:", e);
    return { ok: false, error: "Something went wrong" };
  }
}
