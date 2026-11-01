import { shareCardData } from "@/lib/cards/share-card-data";
import { shareCardMarkup } from "@/lib/cards/share-card-markup";
import { renderPng } from "@/lib/cards/render-server";
import { CARD_FORMATS, parseCardOptions, type CardOptions } from "@/lib/share-card";

// Public share card PNG: someone's last four finished (or played) games,
// from what their public profile already shows. Link previews and the app
// use this; the web's card builder draws cards in the browser instead
// (lib/cards/render-client.ts) from the same markup. Rendering takes
// seconds here, on a worker thread so other requests aren't held up;
// finished cards are kept in memory until the person's diary or profile
// changes (and nginx caches each URL for 10 minutes on top).

// Rendered PNGs by options + a fingerprint of everything drawn on them, so
// an edit to the diary or profile makes a new key. Oldest dropped first.
const CACHE_BYTES = 48 * 1024 * 1024;
const rendered = new Map<string, ArrayBuffer>();
let renderedBytes = 0;

function remember(key: string, png: ArrayBuffer) {
  rendered.set(key, png);
  renderedBytes += png.byteLength;
  for (const [k, v] of rendered) {
    if (renderedBytes <= CACHE_BYTES) break;
    rendered.delete(k);
    renderedBytes -= v.byteLength;
  }
}

const pngResponse = (png: ArrayBuffer) =>
  new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=600" } });

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const opts: CardOptions = parseCardOptions(new URL(request.url).searchParams);
  const card = await shareCardData(decodeURIComponent(username));
  if (!card) return new Response("Not found", { status: 404 });

  const cacheKey = JSON.stringify([card.version, opts]);
  const hit = rendered.get(cacheKey);
  if (hit) {
    // Re-insert so it counts as recently used.
    rendered.delete(cacheKey);
    rendered.set(cacheKey, hit);
    return pngResponse(hit);
  }
  const { width, height } = CARD_FORMATS[opts.format];
  const png = await renderPng(shareCardMarkup(card.data, opts), width, height);
  remember(cacheKey, png);
  return pngResponse(png);
}
