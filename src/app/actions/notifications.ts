"use server";

import { revalidatePath } from "next/cache";
import { saveNotificationSettingsForUser, type NotificationSettings } from "@/lib/notifications";
import { requireUserId } from "@/lib/session";

// How often to email about comments and reactions (lib/notifications.ts).
export async function saveNotificationSettings(
  input: Partial<NotificationSettings>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const result = await saveNotificationSettingsForUser(await requireUserId(), input);
    if (!result.ok) return result;
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    console.error("saveNotificationSettings failed:", e);
    return { ok: false, error: "Something went wrong" };
  }
}
