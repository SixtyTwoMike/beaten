import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import { USERNAME_CHANGE_DAYS } from "./limits";
import { isBuiltInReserved } from "./username-rules";

// Reserved usernames: the built-in list (username-rules.ts), names set aside
// for a particular person, and previous usernames held for their old owner.
// A reserved name can be taken with its invite code (from
// `beaten-admin reserve <name>`), which arrives as /register?invite=<code>.

const hashInvite = (code: string) => createHash("sha256").update(code).digest("hex");

const UNAVAILABLE = "That username isn't available";

async function activeReservation(username: string) {
  const row = await prisma.reservedUsername.findUnique({ where: { username } });
  if (row?.expiresAt && row.expiresAt <= new Date()) {
    await prisma.reservedUsername.deleteMany({ where: { username, expiresAt: { lte: new Date() } } });
    return null;
  }
  return row;
}

// Error message, or null when this person may take `username`.
export async function reservationError(
  username: string,
  who: { userId?: string; invite?: string | null }
): Promise<string | null> {
  const row = await activeReservation(username);
  if (row?.heldForUserId && row.heldForUserId === who.userId) return null;
  if (row?.inviteHash && who.invite && hashInvite(who.invite) === row.inviteHash) return null;
  if (row || isBuiltInReserved(username)) return UNAVAILABLE;
  return null;
}

// The username an invite code is for, if it's still valid.
export async function usernameForInvite(code: string | null | undefined): Promise<string | null> {
  if (!code || !/^[A-Za-z0-9_-]{16,64}$/.test(code)) return null;
  const row = await prisma.reservedUsername.findUnique({ where: { inviteHash: hashInvite(code) } });
  return row ? row.username : null;
}

// Sets `username` aside; returns the invite code that unlocks it. A new
// call replaces any earlier code for the same name.
export async function reserveUsername(username: string, note: string | null): Promise<string> {
  const code = randomBytes(18).toString("base64url");
  const data = { note, inviteHash: hashInvite(code), heldForUserId: null, expiresAt: null };
  await prisma.reservedUsername.upsert({ where: { username }, update: data, create: { username, ...data } });
  return code;
}

// Holds a user's previous username for them, so nobody can take it (and
// inherit links to the old profile) while they might still switch back.
export async function holdPreviousUsername(username: string, userId: string) {
  const expiresAt = new Date(Date.now() + USERNAME_CHANGE_DAYS * 24 * 60 * 60 * 1000);
  const existing = await prisma.reservedUsername.findUnique({ where: { username } });
  // Never replace a name set aside by an admin.
  if (existing?.inviteHash) return;
  await prisma.reservedUsername.upsert({
    where: { username },
    update: { heldForUserId: userId, expiresAt },
    create: { username, heldForUserId: userId, expiresAt },
  });
}
