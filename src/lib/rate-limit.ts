import { createHash } from "node:crypto";
import { prisma } from "./db";

// Attempt limits in the app (nginx limits per IP).
//
// The app runs as two processes. nginx keeps each client IP on the same one,
// so the in-memory limits below (follows, comments, searches, per-IP password
// work) hold per client; a restart only resets them. Password guesses per
// account must hold across IPs, so those are counted in the database
// (the *Shared functions), which both processes see.

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();

// Sweep expired windows now and then so the map can't grow without bound.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, w] of buckets) if (w.resetAt <= now) buckets.delete(key);
}

export type Limit = { max: number; windowMs: number };

// Password guesses per account: 10 per 15 minutes (use the *Shared functions).
export const PASSWORD_ATTEMPTS: Limit = { max: 10, windowMs: 15 * 60 * 1000 };

export const TOO_MANY_ATTEMPTS = "Too many attempts. Wait a few minutes and try again.";

export function isLimited(key: string, limit: Limit): boolean {
  const now = Date.now();
  sweep(now);
  const w = buckets.get(key);
  return Boolean(w && w.resetAt > now && w.count >= limit.max);
}

export function recordAttempt(key: string, limit: Limit) {
  const now = Date.now();
  const w = buckets.get(key);
  if (!w || w.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + limit.windowMs });
  else w.count++;
}

export function clearAttempts(key: string) {
  buckets.delete(key);
}

// Shared (database) counts. Keys are hashed: some contain email addresses.

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export async function isLimitedShared(key: string, limit: Limit): Promise<boolean> {
  const row = await prisma.rateLimit.findUnique({ where: { key: hashKey(key) } });
  return Boolean(row && row.resetAt > new Date() && row.count >= limit.max);
}

export async function recordAttemptShared(key: string, limit: Limit) {
  const id = hashKey(key);
  const now = new Date();
  const fresh = { count: 1, resetAt: new Date(now.getTime() + limit.windowMs) };
  const row = await prisma.rateLimit.upsert({
    where: { key: id },
    create: { key: id, ...fresh },
    update: { count: { increment: 1 } },
  });
  // An expired window starts again.
  if (row.resetAt <= now) await prisma.rateLimit.update({ where: { key: id }, data: fresh });
  sweepShared(now.getTime());
}

export async function clearAttemptsShared(key: string) {
  await prisma.rateLimit.deleteMany({ where: { key: hashKey(key) } });
}

let lastSharedSweep = 0;
function sweepShared(now: number) {
  if (now - lastSharedSweep < 10 * 60_000) return;
  lastSharedSweep = now;
  prisma.rateLimit.deleteMany({ where: { resetAt: { lte: new Date(now) } } }).catch(() => {});
}
