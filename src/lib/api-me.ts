import { prisma } from "./db";
import { AVATAR_SELECT, resolveAvatar } from "./avatar";
import { FINISHED_STATUSES } from "./status";

// GET /api/v1/me, also returned on sign-in: the profile and the dashboard's
// numbers.
export async function meJson(userId: string) {
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const [user, beaten, mastered, finishedThisYear, playing] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, username: true, name: true, passwordHash: true, ...AVATAR_SELECT },
    }),
    prisma.playLog.findMany({
      where: { userId, status: { in: FINISHED_STATUSES } },
      select: { gameId: true },
      distinct: ["gameId"],
    }),
    prisma.playLog.findMany({
      where: { userId, status: "MASTERED" },
      select: { gameId: true },
      distinct: ["gameId"],
    }),
    prisma.playLog.count({ where: { userId, finishedAt: { gte: yearStart } } }),
    prisma.playLog.findMany({
      where: { userId, status: "PLAYING" },
      select: { gameId: true },
      distinct: ["gameId"],
    }),
  ]);
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    // Account deletion asks password accounts for the password, others to
    // type their username or email.
    hasPassword: Boolean(user.passwordHash),
    avatar: resolveAvatar(user),
    stats: {
      playing: playing.length,
      beaten: beaten.length,
      mastered: mastered.length,
      finishedThisYear,
      year: yearStart.getUTCFullYear(),
    },
  };
}
