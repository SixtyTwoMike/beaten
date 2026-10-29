"use server";

import { revalidatePath } from "next/cache";
import { deleteLogForUser, saveLogForUser, type SaveLogInput } from "@/lib/logs";
import { requireUserId } from "@/lib/session";

export type { SaveLogInput };

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveLog(input: SaveLogInput): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    // Client-chosen ids are for the iPhone API only.
    const result = await saveLogForUser(userId, { ...input, clientId: undefined });
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("saveLog failed:", e);
    return { ok: false, error: "Something went wrong saving your log" };
  }
}

export async function deleteLog(logId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    if (!(await deleteLogForUser(userId, logId))) {
      return { ok: false, error: "Log entry not found" };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("deleteLog failed:", e);
    return { ok: false, error: "Something went wrong deleting the log" };
  }
}
