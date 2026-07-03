import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { igdbConfigured, searchGames } from "@/lib/igdb";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!igdbConfigured()) {
    return NextResponse.json({ configured: false, results: [] });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const platformParam = searchParams.get("platform");
  const platformId = platformParam ? Number(platformParam) : undefined;

  if (q.length < 2) {
    return NextResponse.json({ configured: true, results: [] });
  }

  try {
    const results = await searchGames(
      q,
      Number.isFinite(platformId) ? platformId : undefined
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
