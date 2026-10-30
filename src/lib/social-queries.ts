import { prisma } from "./db";
import { PUBLIC_USER_SELECT, blockedEitherWay } from "./follows";
import { normalizeUsername } from "./username";

// People search and follower lists, for the web pages (/people,
// /<username>/followers) and the app's API.

// By username prefix or display name; only accounts that have claimed a
// username (confirmed email), minus anyone blocked either way.
export async function searchPeople(viewerId: string, q: string) {
  const handle = q.toLowerCase();
  const hidden = await blockedEitherWay(viewerId);
  const rows = await prisma.user.findMany({
    where: {
      id: { not: viewerId },
      username: { not: null },
      emailVerifiedAt: { not: null },
      OR: [{ username: { startsWith: handle } }, { name: { contains: q } }],
    },
    orderBy: { username: "asc" },
    take: 25,
    select: PUBLIC_USER_SELECT,
  });
  return rows.filter((r) => !hidden.has(r.id)).slice(0, 20);
}

export const FOLLOW_PAGE = 50;

// Someone's followers or who they follow, newest first, minus people blocked
// either way with the viewer. Null when there's no such profile. Seeing your
// own followers clears the new-followers dot.
export async function followList(viewerId: string, raw: string, kind: "followers" | "following", page: number) {
  const user = await prisma.user.findUnique({
    where: { username: normalizeUsername(raw) },
    select: { id: true, username: true, name: true },
  });
  if (!user?.username) return null;
  const hidden = await blockedEitherWay(viewerId);
  const query = { orderBy: { createdAt: "desc" as const }, skip: page * FOLLOW_PAGE, take: FOLLOW_PAGE + 1 };
  const rows =
    kind === "followers"
      ? (await prisma.follow.findMany({ ...query, where: { followeeId: user.id }, select: { follower: { select: PUBLIC_USER_SELECT } } })).map(
          (f) => f.follower
        )
      : (await prisma.follow.findMany({ ...query, where: { followerId: user.id }, select: { followee: { select: PUBLIC_USER_SELECT } } })).map(
          (f) => f.followee
        );
  if (kind === "followers" && viewerId === user.id) {
    await prisma.user.update({ where: { id: user.id }, data: { followersSeenAt: new Date() } });
  }
  return {
    user,
    people: rows.slice(0, FOLLOW_PAGE).filter((p) => !hidden.has(p.id)),
    more: rows.length > FOLLOW_PAGE,
  };
}
