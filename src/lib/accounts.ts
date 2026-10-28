import { Prisma } from "@prisma/client";
import { prisma } from "./db";

// Marks the email confirmed and gives the account the username it picked at
// sign-up, unless someone confirmed first and took it (they can choose
// another in Settings).
export async function markEmailVerified(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerifiedAt: true, username: true, pendingUsername: true },
  });
  if (!user) return;
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
  });
  if (user.username || !user.pendingUsername) return;
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { username: user.pendingUsername, pendingUsername: null },
    });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    await prisma.user.update({ where: { id: userId }, data: { pendingUsername: null } });
  }
}
