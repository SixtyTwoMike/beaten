import { createHash, createPublicKey, verify, type JsonWebKey } from "node:crypto";

// Sign in with Apple from the iPhone app. The app gets an identity token (a
// JWT Apple signs with RS256) and sends it here with the raw nonce whose
// SHA-256 it gave Apple. We check it ourselves against Apple's published
// keys; no client secret is involved (that's only for the web flow).

const ISSUER = "https://appleid.apple.com";
const KEYS_URL = "https://appleid.apple.com/auth/keys";

export const appleAppBundleId = () => process.env.APPLE_APP_BUNDLE_ID || "games.beaten.app";

type AppleKey = JsonWebKey & { kid: string };
let cachedKeys: { keys: AppleKey[]; fetchedAt: number } | null = null;
const KEYS_TTL_MS = 24 * 60 * 60 * 1000;
// Apple rotates keys now and then: an unknown kid refetches, at most this often.
const REFETCH_MS = 5 * 60 * 1000;

async function appleKeys(forceFresh: boolean): Promise<AppleKey[]> {
  const age = cachedKeys ? Date.now() - cachedKeys.fetchedAt : Infinity;
  if (cachedKeys && age < KEYS_TTL_MS && !(forceFresh && age > REFETCH_MS)) return cachedKeys.keys;
  const res = await fetch(KEYS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Apple keys: HTTP ${res.status}`);
  const { keys } = (await res.json()) as { keys: AppleKey[] };
  cachedKeys = { keys, fetchedAt: Date.now() };
  return keys;
}

export type AppleIdentity = { sub: string; email: string };

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

// The verified identity, or a reason it was refused. `keys` is for tests.
export async function verifyAppleIdentityToken(
  token: string,
  rawNonce: string,
  keys?: AppleKey[]
): Promise<{ ok: true; identity: AppleIdentity } | { ok: false; error: string }> {
  const parts = token.split(".");
  if (parts.length !== 3 || token.length > 4096) return { ok: false, error: "Invalid identity token" };
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = decode(parts[0]);
    claims = decode(parts[1]);
  } catch {
    return { ok: false, error: "Invalid identity token" };
  }
  if (header.alg !== "RS256" || !header.kid) return { ok: false, error: "Invalid identity token" };

  let key = (keys ?? (await appleKeys(false))).find((k) => k.kid === header.kid);
  if (!key && !keys) key = (await appleKeys(true)).find((k) => k.kid === header.kid);
  if (!key) return { ok: false, error: "Invalid identity token" };
  const signed = verify(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey({ key, format: "jwk" }),
    Buffer.from(parts[2], "base64url")
  );
  if (!signed) return { ok: false, error: "Invalid identity token" };

  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER || claims.aud !== appleAppBundleId()) return { ok: false, error: "Invalid identity token" };
  if (typeof claims.exp !== "number" || claims.exp < now) return { ok: false, error: "Apple sign-in expired; try again" };
  // The nonce ties the token to this sign-in, so a captured one can't be replayed.
  const nonceHash = createHash("sha256").update(rawNonce).digest("hex");
  if (!rawNonce || claims.nonce !== nonceHash) return { ok: false, error: "Invalid identity token" };
  if (typeof claims.sub !== "string" || !claims.sub) return { ok: false, error: "Invalid identity token" };
  // Apple sends email_verified as "true" (a string) or true.
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (typeof claims.email !== "string" || !claims.email || !verified) {
    return { ok: false, error: "Apple didn't share a verified email address" };
  }
  return { ok: true, identity: { sub: claims.sub, email: claims.email } };
}
