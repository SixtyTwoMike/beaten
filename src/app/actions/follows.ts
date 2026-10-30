"use server";

import { revalidatePath } from "next/cache";
import { blockForUser, followForUser, unblockForUser, unfollowForUser, type FollowResult } from "@/lib/follow-write";
import { requireUserId } from "@/lib/session";
import type { ActionResult } from "./logs";

// Follow, unfollow, block, unblock (lib/follow-write.ts).

async function run(
  label: string,
  call: (userId: string) => Promise<FollowResult>,
  settings = false
): Promise<ActionResult> {
  try {
    const result = await call(await requireUserId());
    if (!result.ok) return result;
    for (const u of result.usernames) revalidatePath(`/${u}`);
    revalidatePath("/", "layout");
    if (settings) revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    console.error(`${label} failed:`, e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function followUser(username: string): Promise<ActionResult> {
  return run("followUser", (userId) => followForUser(userId, username));
}

export async function unfollowUser(username: string): Promise<ActionResult> {
  return run("unfollowUser", (userId) => unfollowForUser(userId, username));
}

export async function blockUser(username: string): Promise<ActionResult> {
  return run("blockUser", (userId) => blockForUser(userId, username), true);
}

export async function unblockUser(username: string): Promise<ActionResult> {
  return run("unblockUser", (userId) => unblockForUser(userId, username), true);
}
