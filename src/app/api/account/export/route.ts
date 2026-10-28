import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildExport, diaryCsv } from "@/lib/export";

// GET /api/account/export?format=json|csv — the signed-in user's own data.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const data = await buildExport(session.user.id);
  const stamp = data.exportedAt.slice(0, 10);
  const name = data.profile.username ?? "account";

  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (format === "csv") {
    return new NextResponse(diaryCsv(data), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="beaten-${name}-diary-${stamp}.csv"`,
      },
    });
  }
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="beaten-${name}-${stamp}.json"`,
    },
  });
}
