"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sendPasswordChangedEmail } from "@/lib/account-emails";
import { revokeTokens } from "@/lib/tokens";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { passwordError } from "@/lib/password";
import {
  PASSWORD_ATTEMPTS,
  TOO_MANY_ATTEMPTS,
  clearAttempts,
  isLimited,
  recordAttempt,
} from "@/lib/rate-limit";
import { BREACHED_PASSWORD_ERROR, isBreachedPassword } from "@/lib/pwned";
import { formatDate } from "@/lib/format";
import { holdPreviousUsername, reservationError, usernameForInvite } from "@/lib/reserved-usernames";
import { USERNAME_CHANGE_DAYS } from "@/lib/limits";
import { nextUsernameChange, normalizeUsername, usernameError } from "@/lib/username";
import { registerAccount } from "@/lib/register";
import type { ActionResult } from "./logs";

export async function registerUser(input: {
  email: string;
  name: string;
  username: string;
  password: string;
  invite?: string | null;
}): Promise<ActionResult> {
  return registerAccount(input);
}

export async function setUsername(input: string, invite?: string | null): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const username = normalizeUsername(input);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, usernameChangedAt: true },
    });
    if (!user) return { ok: false, error: "Something went wrong saving your username" };
    if (user.username === username) return { ok: true };

    // An invite for this name (beaten-admin reserve) skips the wait.
    const invited = Boolean(invite) && (await usernameForInvite(invite)) === username;
    const next = invited ? null : nextUsernameChange(user);
    if (next) {
      return { ok: false, error: `You can change your username once every ${USERNAME_CHANGE_DAYS} days — next on ${formatDate(next)}` };
    }
    const badUsername = usernameError(username) ?? (await reservationError(username, { userId, invite }));
    if (badUsername) return { ok: false, error: badUsername };

    const taken = await prisma.user.findUnique({ where: { username } });
    if (taken) return { ok: false, error: "That username is taken" };
    await prisma.user.update({
      where: { id: userId },
      // Picking a first username (Google sign-ups) doesn't start the clock.
      data: { username, usernameChangedAt: user.username ? new Date() : null },
    });
    if (user.username) await holdPreviousUsername(user.username, userId);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("setUsername failed:", e);
    return { ok: false, error: "Something went wrong saving your username" };
  }
}

// Invalidates every existing session for the current user (all devices).
export async function signOutEverywhere(): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    // A reset link is as good as a session.
    await revokeTokens(userId, "RESET_PASSWORD");
    return { ok: true };
  } catch (e) {
    console.error("signOutEverywhere failed:", e);
    return { ok: false, error: "Something went wrong signing you out" };
  }
}

// Changing the password signs out every session, including this one; the
// client sends the user to /login to sign in with the new password.
export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash) {
      return { ok: false, error: "This account signs in with Google" };
    }
    const attemptKey = `password:${userId}`;
    if (isLimited(attemptKey, PASSWORD_ATTEMPTS)) return { ok: false, error: TOO_MANY_ATTEMPTS };
    if (
      input.currentPassword.length > 128 ||
      !(await bcrypt.compare(input.currentPassword, user.passwordHash))
    ) {
      recordAttempt(attemptKey, PASSWORD_ATTEMPTS);
      return { ok: false, error: "Current password is incorrect" };
    }
    clearAttempts(attemptKey);
    const badPassword = passwordError(input.newPassword);
    if (badPassword) return { ok: false, error: badPassword };
    if (input.newPassword === input.currentPassword) {
      return { ok: false, error: "Choose a password you haven't used here before" };
    }
    if (await isBreachedPassword(input.newPassword)) {
      return { ok: false, error: BREACHED_PASSWORD_ERROR };
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(input.newPassword, 12),
        tokenVersion: { increment: 1 },
      },
    });
    await revokeTokens(userId, "RESET_PASSWORD");
    after(() =>
      sendPasswordChangedEmail(updated).catch((e) =>
        console.error("password changed email failed:", e)
      )
    );
    return { ok: true };
  } catch (e) {
    console.error("changePassword failed:", e);
    return { ok: false, error: "Something went wrong changing your password" };
  }
}
