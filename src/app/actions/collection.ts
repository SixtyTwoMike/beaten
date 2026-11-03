"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import {
  addCollectionItemForUser,
  deleteCollectionItemForUser,
  setCollectionSettings,
  updateCollectionItemForUser,
  type CollectionInput,
} from "@/lib/collection";
import type { ActionResult } from "./logs";

function refresh() {
  revalidatePath("/collection");
  revalidatePath("/games/[id]", "page");
}

export async function addToCollection(input: CollectionInput): Promise<ActionResult> {
  try {
    const result = await addCollectionItemForUser(await requireUserId(), input);
    if (!result.ok) return { ok: false, error: result.error };
    refresh();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("addToCollection failed:", e);
    return { ok: false, error: "Something went wrong adding it to your collection" };
  }
}

export async function updateCollectionItem(id: string, input: CollectionInput): Promise<ActionResult> {
  try {
    const result = await updateCollectionItemForUser(await requireUserId(), id, input);
    if (!result.ok) return { ok: false, error: result.error };
    refresh();
    return { ok: true };
  } catch (e) {
    console.error("updateCollectionItem failed:", e);
    return { ok: false, error: "Something went wrong saving that" };
  }
}

export async function removeFromCollection(id: string): Promise<ActionResult> {
  try {
    const error = await deleteCollectionItemForUser(await requireUserId(), id);
    if (error) return { ok: false, error };
    refresh();
    return { ok: true };
  } catch (e) {
    console.error("removeFromCollection failed:", e);
    return { ok: false, error: "Something went wrong removing it" };
  }
}

export async function saveCollectionSettings(input: { enabled?: boolean; public?: boolean }): Promise<ActionResult> {
  try {
    const result = await setCollectionSettings(await requireUserId(), input);
    if ("error" in result) return { ok: false, error: result.error };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("saveCollectionSettings failed:", e);
    return { ok: false, error: "Something went wrong saving that" };
  }
}
