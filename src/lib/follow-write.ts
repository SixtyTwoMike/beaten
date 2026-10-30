import { prisma } from "./db";
import { BLOCK_LIMIT, FOLLOW_LIMIT, MAX_FOLLOWING, canSocialise } from "./follows";
import { TOO_MANY_ATTEMPTS, isLimited, recordAttempt } from "./rate-limit";
import { normalizeUsername } from "./username";

// Follow, unfollow, block, unblock, for the web's server actions
// (app/actions/follows.ts) and the app's API. Targets are given by username
// only (never ids); a missing account, yourself, or a block either way all
// get the same answer, so nothing extra is revealed. `usernames` are the
// profiles whose pages changed.

export type FollowResult = { ok: true; usernames: string[] } | { ok: false; error: string };

export const CANT_FOLLOW = "You can't follow this account";

async function me(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, emailVerifiedAt: true } });
}

export async function findTarget(username: unknown) {
  const handle = normalizeUsername(String(username ?? "")).slice(0, 30);
  if (!handle) return null;
  return prisma.user.findUnique({ where: { username: handle }, select: { id: true, username: true, emailVerifiedAt: true } });
}

const names = (...u: (string | null | undefined)[]) => u.filter((x): x is string => Boolean(x));

export async function followForUser(userId: string, username: unknown): Promise<FollowResult> {
  const self = await me(userId);
  if (!canSocialise(self)) return { ok: false, error: "Choose a username in Settings to follow people" };
  if (isLimited(`follow:${userId}`, FOLLOW_LIMIT)) return { ok: false, error: TOO_MANY_ATTEMPTS };
  const other = await findTarget(username);
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
  return { ok: true, usernames: names(self!.username, other.username) };
}

export async function unfollowForUser(userId: string, username: unknown): Promise<FollowResult> {
  const other = await findTarget(username);
  if (other) await prisma.follow.deleteMany({ where: { followerId: userId, followeeId: other.id } });
  const self = await me(userId);
  return { ok: true, usernames: names(self?.username, other?.username) };
}

// Ends follows both ways and stops new ones; each disappears from the other's
// feed and friend lists. Their public profile stays public.
export async function blockForUser(userId: string, username: unknown): Promise<FollowResult> {
  if (isLimited(`block:${userId}`, BLOCK_LIMIT)) return { ok: false, error: TOO_MANY_ATTEMPTS };
  const other = await findTarget(username);
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
  return { ok: true, usernames: names(self?.username, other.username) };
}

export async function unblockForUser(userId: string, username: unknown): Promise<FollowResult> {
  const other = await findTarget(username);
  if (other) await prisma.block.deleteMany({ where: { blockerId: userId, blockedId: other.id } });
  return { ok: true, usernames: names(other?.username) };
}
