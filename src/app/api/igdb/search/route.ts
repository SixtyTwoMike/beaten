import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { igdbConfigured, searchGames } from "@/lib/igdb";
import { isIgdbId } from "@/lib/limits";
import { isLimited, recordAttempt, type Limit } from "@/lib/rate-limit";

const MAX_QUERY = 100;

// Signed-out visitors can search too (the guest Console Chronicles editor),
// up to this many searches per IP address. Search-as-you-type sends a few
// per game.
const GUEST_SEARCHES: Limit = { max: 150, windowMs: 10 * 60 * 1000 };

// nginx appends the address it saw to X-Forwarded-For, so the last entry is
// the one a client can't fake.
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",").pop()?.trim() || "local";
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    const key = `guest-search:${clientIp(request)}`;
    if (isLimited(key, GUEST_SEARCHES)) {
      return NextResponse.json({ error: "Too many searches — try again in a few minutes, or sign in" }, { status: 429 });
    }
    recordAttempt(key, GUEST_SEARCHES);
  }

  if (!igdbConfigured()) {
    return NextResponse.json({ configured: false, results: [] });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);
  const platformParam = searchParams.get("platform");
  const platformId = platformParam ? Number(platformParam) : undefined;

  if (q.length < 2) {
    return NextResponse.json({ configured: true, results: [] });
  }

  try {
    const results = await searchGames(
      q,
      isIgdbId(platformId) ? platformId : undefined
    );
    return NextResponse.json({ configured: true, results });
  } catch (e) {
    console.error("IGDB search failed:", e);
    return NextResponse.json(
      { error: "Search failed — check IGDB credentials" },
      { status: 502 }
    );
  }
}
