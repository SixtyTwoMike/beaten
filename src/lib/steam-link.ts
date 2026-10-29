import { prisma } from "./db";
import { getSteamProfile } from "./steam";

// Links a proven SteamID to a Beaten account. One Steam account can only
// be linked to one Beaten account; switching to another Steam account
// drops the old one's games (diary entries stay).
export async function linkSteamAccount(userId: string, steamId: string): Promise<"linked" | "taken"> {
  const owner = await prisma.steamAccount.findUnique({ where: { steamId } });
  if (owner && owner.userId !== userId) return "taken";
  const profile = await getSteamProfile(steamId).catch(() => null);
  const previous = await prisma.steamAccount.findUnique({ where: { userId } });
  if (previous && previous.steamId !== steamId) {
    await prisma.$transaction([
      prisma.steamGame.deleteMany({ where: { userId } }),
      prisma.steamAccount.delete({ where: { userId } }),
    ]);
  }
  const data = { steamId, personaName: profile?.personaName ?? null, avatarUrl: profile?.avatarUrl ?? null };
  await prisma.steamAccount.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  return "linked";
}
