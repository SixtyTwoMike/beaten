"use server";

import bcrypt from "bcryptjs";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import {
  sendAccountDeletedEmail,
  sendGoogleAccountEmail,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendVerifyEmail,
} from "@/lib/account-emails";
import { MAX_EMAIL } from "@/lib/limits";
import { passwordError } from "@/lib/password";
import { BREACHED_PASSWORD_ERROR, isBreachedPassword } from "@/lib/pwned";
import { markEmailVerified } from "@/lib/accounts";
import {
  PASSWORD_ATTEMPTS,
  TOO_MANY_ATTEMPTS,
  clearAttempts,
  isLimited,
  recordAttempt,
} from "@/lib/rate-limit";
import { requireUserId } from "@/lib/session";
import { consumeToken, issueToken } from "@/lib/tokens";
import type { ActionResult } from "./logs";

// These actions answer identically whether or not an account exists. Any
// lookups and emails run in after(), once the response has been sent, so
// timing doesn't give it away either.

function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email && email.length <= MAX_EMAIL && email.includes("@") ? email : null;
}

function inBackground(label: string, work: () => Promise<void>) {
  after(async () => {
    try {
      await work();
    } catch (e) {
      console.error(`${label} failed:`, e);
    }
  });
}

export async function requestPasswordReset(input: string): Promise<ActionResult> {
  const email = normalizeEmail(input);
  if (!email) return { ok: false, error: "Enter a valid email address" };
  inBackground("requestPasswordReset", async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return;
    if (!user.passwordHash) {
      await sendGoogleAccountEmail(user);
      return;
    }
    const token = await issueToken(user.id, "RESET_PASSWORD");
    if (token) await sendPasswordResetEmail(user, token);
  });
  return { ok: true };
}

export async function resetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<ActionResult> {
  try {
    const badPassword = passwordError(input.newPassword);
    if (badPassword) return { ok: false, error: badPassword };
    if (await isBreachedPassword(input.newPassword)) {
      return { ok: false, error: BREACHED_PASSWORD_ERROR };
    }
    const row = await consumeToken(input.token, "RESET_PASSWORD");
    if (!row) {
      return { ok: false, error: "This reset link has expired or was already used" };
    }
    const user = await prisma.user.update({
      where: { id: row.userId },
      data: {
        passwordHash: await bcrypt.hash(input.newPassword, 12),
        // Revoke every session, including any an attacker may hold.
        tokenVersion: { increment: 1 },
      },
    });
    // Receiving the link proves the address is theirs.
    if (!user.emailVerifiedAt) await markEmailVerified(user.id);
    clearAttempts(`password:${user.id}`);
    inBackground("password changed email", () => sendPasswordChangedEmail(user));
    return { ok: true };
  } catch (e) {
    console.error("resetPassword failed:", e);
    return { ok: false, error: "Something went wrong resetting your password" };
  }
}

export async function verifyEmail(token: string): Promise<ActionResult> {
  try {
    const row = await consumeToken(token, "VERIFY_EMAIL");
    if (!row) {
      return { ok: false, error: "This link has expired or was already used" };
    }
    await markEmailVerified(row.userId);
    return { ok: true };
  } catch (e) {
    console.error("verifyEmail failed:", e);
    return { ok: false, error: "Something went wrong verifying your email" };
  }
}

export async function resendVerification(input: string): Promise<ActionResult> {
  const email = normalizeEmail(input);
  if (!email) return { ok: false, error: "Enter a valid email address" };
  inBackground("resendVerification", async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt || !user.passwordHash) return;
    const token = await issueToken(user.id, "VERIFY_EMAIL");
    if (token) await sendVerifyEmail(user, token);
  });
  return { ok: true };
}

// Permanently deletes the signed-in account; logs, shelves and tokens go with
// it via ON DELETE CASCADE. Password accounts must re-enter their password;
// Google accounts type their username (or email) to confirm.
export async function deleteAccount(input: { confirmation: string }): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { ok: false, error: "Account not found" };

    const confirmation = input.confirmation.slice(0, 254);
    const attemptKey = `password:${userId}`;
    if (user.passwordHash && isLimited(attemptKey, PASSWORD_ATTEMPTS)) {
      return { ok: false, error: TOO_MANY_ATTEMPTS };
    }
    const typed = confirmation.trim().toLowerCase();
    const confirmed = user.passwordHash
      ? await bcrypt.compare(confirmation, user.passwordHash)
      : Boolean(typed) && [user.username, user.email].includes(typed);
    if (!confirmed) {
      if (user.passwordHash) recordAttempt(attemptKey, PASSWORD_ATTEMPTS);
      return {
        ok: false,
        error: user.passwordHash
          ? "Password is incorrect"
          : "Type your username or email exactly to confirm",
      };
    }

    await prisma.user.delete({ where: { id: userId } });
    inBackground("account deleted email", () => sendAccountDeletedEmail(user));
    return { ok: true };
  } catch (e) {
    console.error("deleteAccount failed:", e);
    return { ok: false, error: "Something went wrong deleting your account" };
  }
}
