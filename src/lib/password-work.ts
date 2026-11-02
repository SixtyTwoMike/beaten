import { headers } from "next/headers";
import { isLimited, recordAttempt, type Limit } from "./rate-limit";

// bcrypt work per IP address, on top of the per-account guess limits. Next.js
// runs a server action from whatever page it's posted to, so nginx's strict
// limits on /login, /register etc. can be sidestepped by posting the same
// action to /, which only gets the general POST limit. Each check here costs
// a bcrypt hash or compare (~250ms of the app's one process), so this caps
// how much of that one address can ask for.
const PASSWORD_WORK: Limit = { max: 30, windowMs: 10 * 60 * 1000 };

// nginx appends the address it saw to X-Forwarded-For, so the last entry is
// the one a client can't fake. No header means a local request (dev, the
// smoke tests), which isn't limited.
async function clientIp(): Promise<string | null> {
  try {
    const forwarded = (await headers()).get("x-forwarded-for");
    return forwarded?.split(",").pop()?.trim() || null;
  } catch {
    // Outside a request (the admin CLI).
    return null;
  }
}

// True when this address has used up its budget; otherwise counts one.
export async function passwordWorkLimited(): Promise<boolean> {
  const ip = await clientIp();
  if (!ip) return false;
  const key = `pwwork:${ip}`;
  if (isLimited(key, PASSWORD_WORK)) return true;
  recordAttempt(key, PASSWORD_WORK);
  return false;
}
