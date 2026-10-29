import { createPrivateKey, sign } from "node:crypto";
import Apple from "next-auth/providers/apple";
import type { NextAuthConfig } from "next-auth";

// Sign in with Apple. Apple's "client secret" is a JWT we sign with the .p8
// key (APPLE_PRIVATE_KEY_B64: the file, base64-encoded) and may last at most
// six months, so it's made here and remade every 30 days rather than
// stored. APPLE_CLIENT_ID is the Services ID (e.g. games.beaten.web).

export const appleEnabled = Boolean(
  process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY_B64
);

const LIFETIME_S = 180 * 24 * 60 * 60;
const RENEW_MS = 30 * 24 * 60 * 60 * 1000;
let cached: { secret: string; madeAt: number } | null = null;

const b64url = (v: object | Buffer) => (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString("base64url");

function clientSecret(): string {
  if (cached && Date.now() - cached.madeAt < RENEW_MS) return cached.secret;
  const key = createPrivateKey(Buffer.from(process.env.APPLE_PRIVATE_KEY_B64!, "base64").toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64url({ alg: "ES256", kid: process.env.APPLE_KEY_ID })}.${b64url({
    iss: process.env.APPLE_TEAM_ID,
    iat: now,
    exp: now + LIFETIME_S,
    aud: "https://appleid.apple.com",
    sub: process.env.APPLE_CLIENT_ID,
  })}`;
  const signature = sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
  cached = { secret: `${input}.${b64url(signature)}`, madeAt: Date.now() };
  return cached.secret;
}

type AppleProfile = { sub: string; email?: string; user?: { name?: { firstName?: string; lastName?: string } } };

export function appleProviders(): NextAuthConfig["providers"] {
  if (!appleEnabled) return [];
  return [
    Apple({
      clientId: process.env.APPLE_CLIENT_ID,
      clientSecret: clientSecret(),
      // Apple sends the name only on the very first sign-in, and the email
      // may be a private relay address.
      profile(profile: AppleProfile) {
        const name = [profile.user?.name?.firstName, profile.user?.name?.lastName].filter(Boolean).join(" ");
        return { id: profile.sub, name: name || null, email: profile.email ?? null, image: null };
      },
    }),
  ];
}

// Apple returns users with a cross-site POST (response_mode=form_post), and
// browsers don't send SameSite=Lax cookies on those, so the state / nonce /
// return-address cookies Auth.js checks there must be SameSite=None. (HTTPS
// only; Apple doesn't allow http return URLs anyway.)
export function appleCookies(secure: boolean): NextAuthConfig["cookies"] {
  if (!appleEnabled || !secure) return undefined;
  const opts = (maxAge?: number) => ({ httpOnly: true, sameSite: "none" as const, path: "/", secure: true, ...(maxAge && { maxAge }) });
  return {
    state: { name: "__Secure-authjs.state", options: opts(15 * 60) },
    nonce: { name: "__Secure-authjs.nonce", options: opts(15 * 60) },
    pkceCodeVerifier: { name: "__Secure-authjs.pkce.code_verifier", options: opts(15 * 60) },
    callbackUrl: { name: "__Secure-authjs.callback-url", options: opts() },
  };
}
