"use server";

import { revalidatePath } from "next/cache";
import { requireAdminId } from "@/lib/admin";
import { isAchievementProvider, refreshSteamBeatenForApp, setBeatenAchievementConfirmed } from "@/lib/beaten-achievements";
import { prisma } from "@/lib/db";

// Web admin actions (see src/lib/admin.ts for who's allowed). Forms post
// provider, gameId and key; each action re-checks the admin.

function fields(form: FormData) {
  const provider = String(form.get("provider") ?? "").toUpperCase();
  const externalGameId = String(form.get("gameId") ?? "").trim().slice(0, 64);
  const achievementKey = String(form.get("key") ?? "").trim().slice(0, 128);
  if (!isAchievementProvider(provider) || !externalGameId || !achievementKey) throw new Error("Invalid achievement");
  return { provider, externalGameId, achievementKey };
}

export async function adminConfirmAchievement(form: FormData) {
  await requireAdminId();
  await setBeatenAchievementConfirmed({ ...fields(form), confirmed: true });
  revalidatePath("/admin", "layout");
}

export async function adminUnconfirmAchievement(form: FormData) {
  await requireAdminId();
  await setBeatenAchievementConfirmed({ ...fields(form), confirmed: false });
  revalidatePath("/admin", "layout");
}

// Throw a suggestion away, users' own picks with it.
export async function adminDeleteAchievement(form: FormData) {
  await requireAdminId();
  const { provider, externalGameId, achievementKey } = fields(form);
  await prisma.beatenAchievement.deleteMany({ where: { provider, externalGameId, achievementKey } });
  const appId = Number(externalGameId);
  if (provider === "STEAM" && Number.isInteger(appId) && appId > 0) await refreshSteamBeatenForApp(appId);
  revalidatePath("/admin", "layout");
}
