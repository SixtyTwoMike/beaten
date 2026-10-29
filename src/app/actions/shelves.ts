"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import {
  addGameToShelfForUser,
  createShelfForUser,
  deleteShelfForUser,
  removeGameFromShelfForUser,
} from "@/lib/shelves";
import type { ActionResult } from "./logs";

export async function createShelf(
  name: string,
  description?: string | null
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const result = await createShelfForUser(userId, name, description);
    if (!result.ok) return result;
    revalidatePath("/shelves");
    return { ok: true };
  } catch (e) {
    console.error("createShelf failed:", e);
    return { ok: false, error: "Something went wrong creating the shelf" };
  }
}

export async function deleteShelf(shelfId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const error = await deleteShelfForUser(userId, shelfId);
    if (error) return { ok: false, error };
    revalidatePath("/shelves");
    return { ok: true };
  } catch (e) {
    console.error("deleteShelf failed:", e);
    return { ok: false, error: "Something went wrong deleting the shelf" };
  }
}

export async function addGameToShelf(
  shelfId: string,
  igdbId: number
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const error = await addGameToShelfForUser(userId, shelfId, igdbId);
    if (error) return { ok: false, error };
    revalidatePath("/shelves");
    revalidatePath(`/shelves/${shelfId}`);
    return { ok: true };
  } catch (e) {
    console.error("addGameToShelf failed:", e);
    return { ok: false, error: "Something went wrong adding to the shelf" };
  }
}

export async function removeGameFromShelf(
  shelfId: string,
  gameId: string
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const error = await removeGameFromShelfForUser(userId, shelfId, gameId);
    if (error) return { ok: false, error };
    revalidatePath("/shelves");
    revalidatePath(`/shelves/${shelfId}`);
    return { ok: true };
  } catch (e) {
    console.error("removeGameFromShelf failed:", e);
    return { ok: false, error: "Something went wrong removing from the shelf" };
  }
}
