"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { MAX_ZOOM, MIN_ZOOM, clamp, isAvatarSource } from "@/lib/avatar";
import { normalizeBluesky, normalizeInstagram } from "@/lib/social";
import type { ActionResult } from "./logs";

export async function updateSocialLinks(input: {
  instagram: string;
  bluesky: string;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const instagram = normalizeInstagram(String(input.instagram ?? "").slice(0, 200));
    if (!instagram.ok) return { ok: false, error: instagram.error };
    const bluesky = normalizeBluesky(String(input.bluesky ?? "").slice(0, 300));
    if (!bluesky.ok) return { ok: false, error: bluesky.error };
    await prisma.user.update({
      where: { id: userId },
      data: { instagram: instagram.handle, bluesky: bluesky.handle },
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("updateSocialLinks failed:", e);
    return { ok: false, error: "Something went wrong saving your links" };
  }
}

// Profile picture from a game the user has finished (beaten or mastered).
export async function setAvatar(input: {
  gameId: string;
  source: string;
  x: number;
  y: number;
  zoom: number;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    if (!isAvatarSource(input.source)) return { ok: false, error: "Invalid image" };
    const nums = [input.x, input.y, input.zoom];
    if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) {
      return { ok: false, error: "Invalid crop" };
    }
    const finished = await prisma.playLog.findFirst({
      where: { userId, gameId: String(input.gameId), finishedAt: { not: null } },
      include: { game: { select: { coverUrl: true, artworkUrl: true } } },
    });
    if (!finished) return { ok: false, error: "Pick a game you've finished" };
    const url = input.source === "cover" ? finished.game.coverUrl : finished.game.artworkUrl;
    if (!url) return { ok: false, error: "That game has no image of that kind" };

    await prisma.user.update({
      where: { id: userId },
      data: {
        avatarGameId: finished.gameId,
        avatarSource: input.source,
        avatarX: clamp(input.x, 0, 100),
        avatarY: clamp(input.y, 0, 100),
        avatarZoom: clamp(input.zoom, MIN_ZOOM, MAX_ZOOM),
      },
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("setAvatar failed:", e);
    return { ok: false, error: "Something went wrong saving your picture" };
  }
}

export async function clearAvatar(): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await prisma.user.update({
      where: { id: userId },
      data: { avatarGameId: null, avatarSource: null, avatarX: 50, avatarY: 50, avatarZoom: 1 },
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("clearAvatar failed:", e);
    return { ok: false, error: "Something went wrong removing your picture" };
  }
}
