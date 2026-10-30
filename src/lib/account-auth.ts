import bcrypt from "bcryptjs";
import { PASSWORD_ATTEMPTS, TOO_MANY_ATTEMPTS, clearAttempts, isLimited, recordAttempt } from "./rate-limit";
import { prisma } from "./db";

// Password and Google/Apple account rules shared by the web (Auth.js and
// server actions) and the app's /api/v1. Kept apart from accounts.ts, which
// the beaten-admin CLI compiles: its bundle has no bcryptjs.

// Permanently deletes an account; logs, shelves and tokens go with it via ON
// DELETE CASCADE. Password accounts must re-enter their password; Google and
// Apple accounts type their username (or email) to confirm. Returns the
// deleted user (for the goodbye email) or an error.
export async function deleteAccountForUser(
  userId: string,
  confirmation: string
): Promise<{ ok: true; user: { email: string; name: string | null } } | { ok: false; error: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "Account not found" };

  confirmation = typeof confirmation === "string" ? confirmation.slice(0, 254) : "";
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
      error: user.passwordHash ? "Password is incorrect" : "Type your username or email exactly to confirm",
    };
  }

  await prisma.user.delete({ where: { id: userId } });
  return { ok: true, user };
}

// Compared against when the email is unknown, so a failed sign-in takes the
// same bcrypt time whether or not the account exists.
const DUMMY_HASH = "$2b$12$bcZWFlt4lprVdx1DlBLZL.VPJAXEI.1FjI1.hT0Acr7FBLUp1Qmhu";

// Email + password sign-in, for the web Credentials provider and the app's
// /api/v1/auth/login. "unverified": right password, but the address hasn't
// been confirmed (only reachable with the password, so it doesn't help
// enumerate accounts).
export async function checkPassword(rawEmail: unknown, rawPassword: unknown) {
  const email = String(rawEmail ?? "")
    .trim()
    .toLowerCase();
  const password = String(rawPassword ?? "");
  if (!email || !password || email.length > 254 || password.length > 128) {
    return "invalid" as const;
  }
  // Per-account guess limit (nginx limits per IP). Keyed by email so
  // unknown addresses behave the same; still runs bcrypt so a limited
  // account answers in the usual time.
  const attemptKey = `login:${email}`;
  const limited = isLimited(attemptKey, PASSWORD_ATTEMPTS);
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (limited) return "invalid" as const;
  if (!user?.passwordHash || !valid) {
    recordAttempt(attemptKey, PASSWORD_ATTEMPTS);
    return "invalid" as const;
  }
  clearAttempts(attemptKey);
  if (!user.emailVerifiedAt) return "unverified" as const;
  return user;
}

// Google / Apple sign-in with an address the provider has verified: may it
// sign in? Never attach such a login to a confirmed password account:
// whoever registered that address with a password would keep access
// alongside it.
export async function admitOAuthEmail(rawEmail: string): Promise<boolean> {
  const existing = await prisma.user.findUnique({
    where: { email: rawEmail.toLowerCase() },
    select: { id: true, passwordHash: true, emailVerifiedAt: true },
  });
  if (!existing?.passwordHash) return true;
  if (existing.emailVerifiedAt) return false;
  // An unconfirmed password sign-up on this address may not be the
  // owner's. Google/Apple has now proved ownership: drop the password and
  // anything the sign-up chose, and void its links and sessions.
  await prisma.user.update({
    where: { id: existing.id },
    data: {
      passwordHash: null,
      pendingUsername: null,
      emailVerifiedAt: new Date(),
      tokenVersion: { increment: 1 },
    },
  });
  await prisma.authToken.deleteMany({ where: { userId: existing.id } });
  return true;
}

// The account for an admitted Google / Apple address, made on first sign-in.
export function upsertOAuthUser(rawEmail: string, name: string | null, image: string | null) {
  const email = rawEmail.toLowerCase();
  return prisma.user.upsert({
    where: { email },
    update: { name: name ?? undefined, image: image ?? undefined },
    create: {
      email,
      name,
      image,
      // admitOAuthEmail callers only pass addresses marked email_verified.
      emailVerifiedAt: new Date(),
    },
  });
}
