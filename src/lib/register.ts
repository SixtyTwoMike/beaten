import bcrypt from "bcryptjs";
import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { sendAlreadyRegisteredEmail, sendVerifyEmail } from "./account-emails";
import { prisma } from "./db";
import { MAX_EMAIL, MAX_NAME } from "./limits";
import { passwordError } from "./password";
import { BREACHED_PASSWORD_ERROR, isBreachedPassword } from "./pwned";
import { reservationError } from "./reserved-usernames";
import { issueToken } from "./tokens";
import { normalizeUsername, usernameError } from "./username";

// Signing up with a password, for the web's register form
// (app/actions/auth.ts) and the iPhone app (POST /api/v1/auth/register).
// Either way the answer is "check your email": the account can sign in once
// the address is confirmed.

export type RegisterResult = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Display names appear in emails sent before an address is confirmed, so
// keep them to one line and free of links.
function displayNameError(name: string): string | null {
  if (!name) return "Enter a display name";
  if (name.length > MAX_NAME) return `Display name must be ${MAX_NAME} characters or fewer`;
  if (/https?:|www\.|\.[a-z]{2,}\//i.test(name)) return "Display names can't contain links";
  return null;
}

export async function registerAccount(input: {
  email: string;
  name: string;
  username: string;
  password: string;
  invite?: string | null;
}): Promise<RegisterResult> {
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
    console.error("registerAccount failed:", e);
    return { ok: false, error: "Something went wrong creating your account" };
  }
}

