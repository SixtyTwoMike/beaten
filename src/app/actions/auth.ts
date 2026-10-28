"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { MAX_EMAIL, MAX_NAME, MAX_PASSWORD_BYTES } from "@/lib/limits";
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
    if (password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters" };
    }
    if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
      return { ok: false, error: "Password must be 72 characters or fewer" };
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { ok: false, error: "An account with that email already exists" };
    }
    if (await prisma.user.findUnique({ where: { username } })) {
      return { ok: false, error: "That username is taken" };
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({ data: { email, name, username, passwordHash } });
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
