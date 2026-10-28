// Builds the console photos for Console Chronicles from Wikimedia Commons.
//
//   node scripts/console-images.mjs            # fetch anything missing
//   node scripts/console-images.mjs --force    # re-fetch everything
//
// Reads scripts/console-images.json (IGDB platform id -> Commons file),
// downloads a 1200px rendition of each, turns a plain white studio
// background transparent, trims and resizes it, and writes
// public/consoles/<id>.webp plus src/lib/console-images.json with each
// photo's size and attribution (shown on /credits). Consoles not listed use
// their IGDB logo instead.

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import sharp from "sharp";

const root = new URL("..", import.meta.url);
const OUT_DIR = new URL("public/consoles/", root);
const INDEX = new URL("src/lib/console-images.json", root);
const UA = "BeatenConsoleImages/1.0 (https://beaten.games)";
const SIZE = 640; // longest side of the stored image
const force = process.argv.includes("--force");

const manifest = JSON.parse(await readFile(new URL("scripts/console-images.json", root), "utf8"));
const existing = JSON.parse(await readFile(INDEX, "utf8").catch(() => "{}"));
await mkdir(OUT_DIR, { recursive: true });

async function commonsInfo(title) {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({
    action: "query", format: "json", titles: title, prop: "imageinfo",
    iiprop: "url|extmetadata|mime", iiurlwidth: "1200",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist",
  })) u.searchParams.set(k, v);
  const page = Object.values((await (await fetch(u, { headers: { "User-Agent": UA } })).json()).query.pages)[0];
  const ii = page.imageinfo?.[0];
  if (!ii) throw new Error(`not on Commons: ${title}`);
  const m = ii.extmetadata ?? {};
  const strip = (s) => (s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return {
    url: ii.thumburl ?? ii.url,
    source: ii.descriptionurl,
    artist: strip(m.Artist?.value),
    license: strip(m.LicenseShortName?.value),
    licenseUrl: m.LicenseUrl?.value ?? null,
  };
}

// Studio shots on white: flood-fill near-white pixels connected to the
// edge to transparent (so white parts *inside* a console survive), then
// soften the cut edge by one pixel.
async function cutOut(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const alreadyCut = [0, w - 1, (h - 1) * w, h * w - 1].every((i) => data[i * 4 + 3] < 16);
  if (alreadyCut) return sharp(input).ensureAlpha();
  const white = (i) => data[i * 4] > 236 && data[i * 4 + 1] > 236 && data[i * 4 + 2] > 236;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || !white(i)) continue;
    seen[i] = 1;
    data[i * 4 + 3] = 0;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  for (let i = 0; i < w * h; i++) {
    if (seen[i]) continue;
    const x = i % w;
    const edge = (x > 0 && seen[i - 1]) || (x < w - 1 && seen[i + 1]) || (i >= w && seen[i - w]) || (i < w * (h - 1) && seen[i + w]);
    if (edge) data[i * 4 + 3] = 128;
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } });
}

const index = {};
for (const [id, title] of Object.entries(manifest)) {
  if (id.startsWith("_")) continue;
  const file = new URL(`${id}.webp`, OUT_DIR);
  const have = await access(file).then(() => true, () => false);
  if (have && !force && existing[id]?.file === title) {
    index[id] = existing[id];
    continue;
  }
  try {
    const info = await commonsInfo(title);
    const res = await fetch(info.url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const cut = await cutOut(Buffer.from(await res.arrayBuffer()));
    const trimmed = await cut.png().toBuffer().then((b) => sharp(b).trim({ threshold: 1 }).toBuffer());
    const out = await sharp(trimmed)
      .resize(SIZE, SIZE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86, alphaQuality: 90 })
      .toBuffer({ resolveWithObject: true });
    await writeFile(file, out.data);
    index[id] = {
      file: title,
      width: out.info.width,
      height: out.info.height,
      artist: info.artist,
      license: info.license,
      licenseUrl: info.licenseUrl,
      source: info.source,
    };
    console.log(`${id}: ${title.slice(5)} (${info.license}, ${out.info.width}x${out.info.height}, ${Math.round(out.data.length / 1024)}KB)`);
  } catch (e) {
    console.error(`${id}: FAILED ${title}: ${e.message}`);
    if (existing[id]) index[id] = existing[id];
  }
  await new Promise((r) => setTimeout(r, 250));
}

await writeFile(INDEX, JSON.stringify(index, null, 2) + "\n");
console.log(`${Object.keys(index).length} console images in src/lib/console-images.json`);
