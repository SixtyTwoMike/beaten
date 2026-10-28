// Per-account attempt limits for password checks. nginx limits per IP; this
// stops many IPs guessing at one account. In memory: the app runs as a single
// process, and a restart only resets the counters.

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

// Password guesses per account: 10 per 15 minutes.
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
