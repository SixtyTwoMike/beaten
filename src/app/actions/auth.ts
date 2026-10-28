"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
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

    if (!EMAIL_RE.test(email)) {
      return { ok: false, error: "Enter a valid email address" };
    }
    if (!name) return { ok: false, error: "Enter a display name" };
    const badUsername = usernameError(username);
    if (badUsername) return { ok: false, error: badUsername };
    if (password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters" };
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
