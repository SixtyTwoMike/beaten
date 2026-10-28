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
import { issueToken } from "@/lib/tokens";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { MAX_EMAIL, MAX_NAME } from "@/lib/limits";
import { passwordError } from "@/lib/password";
import { BREACHED_PASSWORD_ERROR, isBreachedPassword } from "@/lib/pwned";
import { normalizeUsername, usernameError } from "@/lib/username";
import type { ActionResult } from "./logs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerUser(input: {
  email: string;
  name: string;
  username: string;
  password: string;
}): Promise<ActionResult> {
  try {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    const username = normalizeUsername(input.username);
    const password = input.password;

    if (!EMAIL_RE.test(email) || email.length > MAX_EMAIL) {
      return { ok: false, error: "Enter a valid email address" };
    }
    if (!name) return { ok: false, error: "Enter a display name" };
    if (name.length > MAX_NAME) {
      return { ok: false, error: `Display name must be ${MAX_NAME} characters or fewer` };
    }
    const badUsername = usernameError(username);
    if (badUsername) return { ok: false, error: badUsername };
    const badPassword = passwordError(password);
    if (badPassword) return { ok: false, error: badPassword };

    // Usernames are public, so saying one is taken reveals nothing.
    if (await prisma.user.findUnique({ where: { username } })) {
      return { ok: false, error: "That username is taken" };
    }

    if (await isBreachedPassword(password)) {
      return { ok: false, error: BREACHED_PASSWORD_ERROR };
    }

    // Whether or not the email is already registered, the response is the
    // same ("check your email"); only the email that's sent differs.
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      after(() =>
        sendAlreadyRegisteredEmail(existing).catch((e) =>
          console.error("already-registered email failed:", e)
        )
      );
      return { ok: true };
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let user;
    try {
      user = await prisma.user.create({ data: { email, name, username, passwordHash } });
    } catch (e) {
      // Lost a race for the same email or username.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = String(e.meta?.target ?? "");
        if (target.includes("username")) return { ok: false, error: "That username is taken" };
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

export async function setUsername(input: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const username = normalizeUsername(input);
    const badUsername = usernameError(username);
    if (badUsername) return { ok: false, error: badUsername };

    const taken = await prisma.user.findUnique({ where: { username } });
    if (taken && taken.id !== userId) {
      return { ok: false, error: "That username is taken" };
    }
    await prisma.user.update({ where: { id: userId }, data: { username } });
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
    if (
      input.currentPassword.length > 128 ||
      !(await bcrypt.compare(input.currentPassword, user.passwordHash))
    ) {
      return { ok: false, error: "Current password is incorrect" };
    }
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
