"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import {
  addToPullListForUser,
  importSteamWishlistForUser,
  removeFromPullListForUser,
  reorderPullListForUser,
  type WishlistResult,
} from "@/lib/pull-list";
import type { ActionResult } from "./logs";

export async function addToPullList(igdbId: number): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const error = await addToPullListForUser(userId, igdbId);
    if (error) return { ok: false, error };
    revalidatePath("/pull-list");
    return { ok: true };
  } catch (e) {
    console.error("addToPullList failed:", e);
    return { ok: false, error: "Something went wrong adding to your Pull List" };
  }
}

export async function removeFromPullList(igdbId: number): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const error = await removeFromPullListForUser(userId, igdbId);
    if (error) return { ok: false, error };
    revalidatePath("/pull-list");
    return { ok: true };
  } catch (e) {
    console.error("removeFromPullList failed:", e);
    return { ok: false, error: "Something went wrong removing from your Pull List" };
  }
}

export async function reorderPullList(igdbIds: number[]): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const error = await reorderPullListForUser(userId, igdbIds);
    if (error) return { ok: false, error };
    revalidatePath("/pull-list");
    return { ok: true };
  } catch (e) {
    console.error("reorderPullList failed:", e);
    return { ok: false, error: "Something went wrong saving the order" };
  }
}

export async function importSteamWishlist(): Promise<WishlistResult> {
  try {
    const userId = await requireUserId();
    const result = await importSteamWishlistForUser(userId);
    revalidatePath("/pull-list");
    return result;
  } catch (e) {
    console.error("importSteamWishlist failed:", e);
    return { ok: false, error: "Couldn't reach Steam — try again shortly" };
  }
}
