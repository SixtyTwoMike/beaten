import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { linkSteamAccount } from "@/lib/steam-link";
import { mockEnabled, verifySteamLogin } from "@/lib/steam";

// STEAM_MOCK: a made-up SteamID per account, so test accounts never clash.
function mockSteamId(userId: string): string {
  const n = parseInt(createHash("sha256").update(userId).digest("hex").slice(0, 8), 16);
  return `7656119${String(n).padStart(10, "0")}`;
}

function sameNonce(a: string | undefined, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// GET /api/steam/callback — Steam sends the user back here. The SteamID is
// only trusted once Steam confirms the signed response.
export async function GET(request: NextRequest) {
  const back = (result: string) => {
    const res = NextResponse.redirect(`${appUrl()}/settings?steam=${result}#steam`);
    res.cookies.delete({ name: "steam_link", path: "/api/steam" });
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  };
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(`${appUrl()}/login`);

  const params = request.nextUrl.searchParams;
  const nonce = params.get("n");
  if (!sameNonce(request.cookies.get("steam_link")?.value, nonce)) return back("expired");

  let steamId: string | null;
  try {
    steamId =
      mockEnabled() && params.get("mock") === "1"
        ? mockSteamId(session.user.id)
        : await verifySteamLogin(params, `${appUrl()}/api/steam/callback?n=${nonce}`);
  } catch (e) {
    console.error("Steam sign-in check failed:", e);
    return back("unreachable");
  }
  if (!steamId) return back("failed");

  try {
    const result = await linkSteamAccount(session.user.id, steamId);
    return back(result);
  } catch (e) {
    console.error("Steam link failed:", e);
    return back("unreachable");
  }
}
