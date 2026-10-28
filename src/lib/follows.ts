import { prisma } from "./db";
import { AVATAR_SELECT } from "./avatar";
import type { Limit } from "./rate-limit";

// Following, modelled on Letterboxd: one-way, no approval, profiles public.
// Only accounts with a confirmed email and a username take part, so nobody
// appears socially before claiming a profile.

// The only user fields social pages may show. Never select emails here.
export const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  name: true,
  image: true,
  ...AVATAR_SELECT,
} as const;

export const MAX_FOLLOWING = 2000;
export const FOLLOW_LIMIT: Limit = { max: 60, windowMs: 60 * 60 * 1000 };
export const BLOCK_LIMIT: Limit = { max: 30, windowMs: 60 * 60 * 1000 };
export const SEARCH_LIMIT: Limit = { max: 60, windowMs: 10 * 60 * 1000 };

export function canSocialise(user: { username: string | null; emailVerifiedAt: Date | null } | null): boolean {
  return Boolean(user?.username && user.emailVerifiedAt);
}

// Everyone `userId` has blocked or been blocked by.
export async function blockedEitherWay(userId: string): Promise<Set<string>> {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return new Set(rows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)));
}

// Who `userId` follows, minus anyone blocked either way.
export async function followingIds(userId: string): Promise<string[]> {
  const [follows, blocked] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: userId }, select: { followeeId: true } }),
    blockedEitherWay(userId),
  ]);
  return follows.map((f) => f.followeeId).filter((id) => !blocked.has(id));
}

export async function followCounts(userId: string) {
  const [followers, following] = await Promise.all([
    prisma.follow.count({ where: { followeeId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);
  return { followers, following };
}

// Followers since they last looked (for the dot on their avatar).
export async function newFollowerCount(userId: string, seenAt: Date | null): Promise<number> {
  return prisma.follow.count({ where: { followeeId: userId, ...(seenAt && { createdAt: { gt: seenAt } }) } });
}
