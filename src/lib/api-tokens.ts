import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";

// Bearer tokens for the iPhone app (see ApiToken in schema.prisma). The token
// is shown to the app once; only its SHA-256 is kept.

// Signed out after this long without being used.
const IDLE_MS = 90 * 24 * 60 * 60 * 1000;
// Devices signed in at once; signing in on another drops the oldest.
const MAX_PER_USER = 20;
// lastUsedAt is written at most this often, not on every request.
const TOUCH_MS = 60 * 60 * 1000;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function issueApiToken(userId: string, deviceName: unknown): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { tokenVersion: true } });
  const token = randomBytes(32).toString("base64url");
  const name = typeof deviceName === "string" ? deviceName.trim().slice(0, 60) || null : null;
  await prisma.apiToken.create({
    data: { userId, tokenHash: hash(token), name, tokenVersion: user.tokenVersion },
  });
  const extra = await prisma.apiToken.findMany({
    where: { userId },
    orderBy: { lastUsedAt: "desc" },
    skip: MAX_PER_USER,
    select: { id: true },
  });
  if (extra.length) await prisma.apiToken.deleteMany({ where: { id: { in: extra.map((t) => t.id) } } });
  return token;
}

// The token's id and user, or null when it's unknown, idle too long, or
// voided by "sign out everywhere".
export async function resolveApiToken(token: string): Promise<{ id: string; userId: string } | null> {
  if (!token || token.length > 100) return null;
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: { select: { tokenVersion: true } } },
  });
  if (!row) return null;
  const now = Date.now();
  if (row.tokenVersion !== row.user.tokenVersion || now - row.lastUsedAt.getTime() > IDLE_MS) {
    await prisma.apiToken.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }
  if (now - row.lastUsedAt.getTime() > TOUCH_MS) {
    await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date(now) } });
  }
  return { id: row.id, userId: row.userId };
}

export async function revokeApiToken(id: string) {
  await prisma.apiToken.deleteMany({ where: { id } });
}
