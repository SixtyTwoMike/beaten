import { createHash } from "node:crypto";

// Have I Been Pwned "range" check (k-anonymity): only the first 5 hex chars
// of the password's SHA-1 leave the server. Fails open — an outage at HIBP
// shouldn't stop people signing up — and logs when it does.
export async function isBreachedPassword(password: string): Promise<boolean> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    return body.split("\n").some((line) => {
      const [hashSuffix, count] = line.trim().split(":");
      return hashSuffix === suffix && Number(count) > 0;
    });
  } catch (e) {
    console.error("Pwned Passwords check failed (allowing password):", e);
    return false;
  }
}

export const BREACHED_PASSWORD_ERROR =
  "That password has appeared in a data breach — please choose a different one";
