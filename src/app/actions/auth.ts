"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { Prisma } from "@prisma/client";
import {
  sendAlreadyRegisteredEmail,
  sendPasswordChangedEmail,
  sendVerifyEmail,
} from "@/lib/account-emails";
import { issueToken, revokeTokens } from "@/lib/tokens";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { MAX_EMAIL, MAX_NAME } from "@/lib/limits";
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
import type { ActionResult } from "./logs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Display names appear in emails sent before an address is confirmed, so
// keep them to one line and free of links.
function displayNameError(name: string): string | null {
  if (!name) return "Enter a display name";
  if (name.length > MAX_NAME) return `Display name must be ${MAX_NAME} characters or fewer`;
  if (/https?:|www\.|\.[a-z]{2,}\//i.test(name)) return "Display names can't contain links";
  return null;
}

export async function registerUser(input: {
  email: string;
  name: string;
  username: string;
  password: string;
  invite?: string | null;
}): Promise<ActionResult> {
  try {
    const email = input.email.trim().toLowerCase();
    // Control characters (newlines included) become spaces.
    const name = input.name.replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(/\s+/g, " ").trim();
    const username = normalizeUsername(input.username);
    const password = input.password;

    if (!EMAIL_RE.test(email) || email.length > MAX_EMAIL) {
      return { ok: false, error: "Enter a valid email address" };
    }
    const badName = displayNameError(name);
    if (badName) return { ok: false, error: badName };
    const badUsername =
      usernameError(username) ?? (await reservationError(username, { invite: input.invite }));
    if (badUsername) return { ok: false, error: badUsername };
    const badPassword = passwordError(password);
    if (badPassword) return { ok: false, error: badPassword };

    // Only confirmed accounts hold usernames, so this reveals nothing about
    // which emails have signed up.
    if (await prisma.user.findUnique({ where: { username } })) {
      return { ok: false, error: "That username is taken" };
    }

    if (await isBreachedPassword(password)) {
      return { ok: false, error: BREACHED_PASSWORD_ERROR };
    }

    // Whether or not the email is already registered, the response is the
    // same ("check your email") and takes as long; only the email sent
    // differs. The username is held as pending until the address is
    // confirmed, so nothing public changes either way.
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      after(() =>
        sendAlreadyRegisteredEmail(existing).catch((e) =>
          console.error("already-registered email failed:", e)
        )
      );
      return { ok: true };
    }

    let user;
    try {
      user = await prisma.user.create({
        data: { email, name, pendingUsername: username, passwordHash },
      });
    } catch (e) {
      // Lost a race for the same email.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { ok: true };
      }
      throw e;
    }
    const created = user;
    after(async () => {
      try {
        const token = await issueToken(created.id, "VERIFY_EMAIL");
        if (token) await sendVerifyEmail(created, token);
      } catch (e) {
        console.error("verification email failed:", e);
      }
    });
    return { ok: true };
  } catch (e) {
    console.error("registerUser failed:", e);
    return { ok: false, error: "Something went wrong creating your account" };
  }
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
