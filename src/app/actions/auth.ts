"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import type { ActionResult } from "./logs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerUser(input: {
  email: string;
  name: string;
  password: string;
}): Promise<ActionResult> {
  try {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    const password = input.password;

    if (!EMAIL_RE.test(email)) {
      return { ok: false, error: "Enter a valid email address" };
    }
    if (!name) return { ok: false, error: "Enter a display name" };
    if (password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters" };
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { ok: false, error: "An account with that email already exists" };
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({ data: { email, name, passwordHash } });
    return { ok: true };
  } catch (e) {
    console.error("registerUser failed:", e);
    return { ok: false, error: "Something went wrong creating your account" };
  }
}
