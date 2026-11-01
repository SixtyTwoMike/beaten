import { prisma } from "@/lib/db";
import { loadChronicle } from "@/lib/chronicle";
import { chronicleCardMarkup, DEFAULT_CHRONICLE_CARD, type ChroniclePick } from "@/lib/cards/chronicle-card-markup";
import { withInlineArt } from "@/lib/cards/chronicle-card-server";
import { renderPng } from "@/lib/cards/render-server";
import { CARD_FORMATS, type CardFormat } from "@/lib/share-card";
import { normalizeUsername } from "@/lib/username";

// Someone's Console Chronicles as a PNG, for link previews of
// /<username>/chronicles. The editor draws these in the browser instead
// (components/ChronicleImageShare). Rendered on a worker thread and kept
// in memory until the chronicle changes.

const rendered = new Map<string, ArrayBuffer>();

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const q = new URL(request.url).searchParams;
  const format: CardFormat = q.get("format") === "square" ? "square" : q.get("format") === "story" ? "story" : "wide";
  const pick: ChroniclePick = q.get("pick") === "latest" ? "latest" : q.get("pick") === "first" ? "first" : format === "wide" ? "latest" : "all";
  const user = await prisma.user.findUnique({
    where: { username: normalizeUsername(decodeURIComponent(username)) },
    select: { id: true, name: true, username: true, chronicle: { select: { userId: true } } },
  });
  if (!user?.username || !user.chronicle) return new Response("Not found", { status: 404 });
  const view = await loadChronicle(user);
  if (view.stops.length === 0) return new Response("Not found", { status: 404 });

  const key = JSON.stringify([view, format, pick]);
  let png = rendered.get(key);
  if (!png) {
    const { width, height } = CARD_FORMATS[format];
    png = await renderPng(chronicleCardMarkup(await withInlineArt(view), { ...DEFAULT_CHRONICLE_CARD, format, pick }), width, height);
    if (rendered.size > 100) rendered.delete(rendered.keys().next().value!);
    rendered.set(key, png);
  }
  return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=600" } });
}
