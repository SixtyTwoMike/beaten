import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { mockEnabled, steamConfigured, steamLoginUrl } from "@/lib/steam";

// GET /api/steam/login — sends the signed-in user to Steam's sign-in page to
// prove which Steam account is theirs. A one-time nonce in a cookie ties
// the callback to this browser, so nobody can link their Steam account to
// someone else's Beaten account by sending them a callback link.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(`${appUrl()}/login`);
  if (!steamConfigured()) return NextResponse.redirect(`${appUrl()}/settings`);

  const nonce = randomBytes(18).toString("base64url");
  const returnTo = `${appUrl()}/api/steam/callback?n=${nonce}`;
  const target = mockEnabled() ? `${returnTo}&mock=1` : steamLoginUrl(returnTo, appUrl());
  const res = NextResponse.redirect(target);
  res.cookies.set("steam_link", nonce, {
    httpOnly: true,
    secure: appUrl().startsWith("https://"),
    sameSite: "lax",
    path: "/api/steam",
    maxAge: 10 * 60,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
