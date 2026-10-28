/* eslint-disable @next/next/no-img-element -- ImageResponse (satori) markup, not the DOM */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { BADGE_LABELS, STORY_PER_PAGE, loadChronicle, type ChronicleStop, type ChronicleView } from "@/lib/chronicle";
import { loadFonts } from "@/lib/og-fonts";
import { normalizeUsername } from "@/lib/username";
import { STAR_PATH } from "@/components/Stars";

// One Instagram story page (1080x1920) of someone's console chronicle:
// three consoles on the zig-zag road, numbered "1 / 3" so a set posts in
// order. Public like the chronicle page itself. Pages are kept in memory
// until the chronicle changes, as share cards are.

const W = 1080;
const H = 1920;
const CANVAS = "#0e1216";
const CARD = "#161c22";
const FOG = "#8fa0b0";
const PAD = 64;
const HEADER = 300;
const FOOTER = 130;
const SLOT = (H - HEADER - FOOTER) / STORY_PER_PAGE;
const STOP_W = 560;
// Open road between one card and the next.
const GAP = 84;
const STOP_H = SLOT - GAP;
const centreX = (right: boolean) => (right ? W - PAD - STOP_W / 2 : PAD + STOP_W / 2);
const cardTop = (i: number) => HEADER + SLOT * i + GAP / 2;

const CACHE_BYTES = 32 * 1024 * 1024;
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

// Console photos are read from disk (the renderer can't fetch relative URLs).
const photoCache = new Map<string, string>();
async function photoDataUrl(key: string): Promise<string | null> {
  if (photoCache.has(key)) return photoCache.get(key)!;
  if (!/^[0-9]+(-[a-z0-9-]+)?$/.test(key)) return null;
  try {
    const data = await readFile(path.join(process.cwd(), "public/consoles", `${key}.png`));
    const url = `data:image/png;base64,${data.toString("base64")}`;
    photoCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

function Road({ view, page, pages, stops, first }: { view: ChronicleView; page: number; pages: number; stops: ChronicleStop[]; first: number }) {
  const a = view.accentHex;
  const side = (i: number) => centreX((first + i) % 2 === 1);
  // Bottom of one card to the top of the next; in from the previous page
  // and out towards the next; on the last page, on to a "next stop?".
  const legs: [number, number, number, number][] = [];
  if (page > 1) legs.push([W / 2, HEADER - 24, side(0), cardTop(0)]);
  for (let i = 1; i < stops.length; i++) legs.push([side(i - 1), cardTop(i - 1) + STOP_H, side(i), cardTop(i)]);
  const last = stops.length - 1;
  const more = page < pages;
  const nextStop = !more && stops.length < STORY_PER_PAGE;
  if (more) legs.push([side(last), cardTop(last) + STOP_H, W / 2, H - FOOTER + 6]);
  if (nextStop) legs.push([side(last), cardTop(last) + STOP_H, side(last + 1), cardTop(last + 1) + 60]);
  const d = legs
    .map(([x1, y1, x2, y2]) => {
      const mid = (y1 + y2) / 2;
      return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
    })
    .join(" ");
  const dots = legs.flatMap(([x1, y1, x2, y2]) => [
    [x1, y1],
    [x2, y2],
  ]).filter(([, y]) => y > HEADER - 10 && y < H - FOOTER);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", top: 0, left: 0 }}>
      {view.path === "neon" && <path d={d} stroke={a} strokeOpacity={0.25} strokeWidth={22} fill="none" />}
      {view.path === "neon" && <path d={d} stroke={a} strokeWidth={6} fill="none" />}
      {view.path === "pixel" && <path d={d} stroke={a} strokeOpacity={0.85} strokeWidth={14} strokeDasharray="18 18" fill="none" />}
      {view.path === "dotted" && <path d={d} stroke={a} strokeWidth={10} strokeDasharray="1 26" strokeLinecap="round" fill="none" />}
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={11} fill={CANVAS} stroke={a} strokeWidth={5} />
      ))}
      {nextStop && (
        <circle cx={side(last + 1)} cy={cardTop(last + 1) + 130} r={70} fill={CANVAS} stroke={a} strokeWidth={4} strokeDasharray="10 12" />
      )}
    </svg>
  );
}

function NextStop({ view, x, y }: { view: ChronicleView; x: number; y: number }) {
  return (
    <div style={{ position: "absolute", left: x - 70, top: y - 70, width: 140, height: 140, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", fontSize: 52, fontWeight: 700, color: view.accentHex, lineHeight: 1 }}>?</div>
      <div style={{ display: "flex", fontSize: 18, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: FOG, marginTop: 6 }}>Next stop</div>
    </div>
  );
}

function Background({ view }: { view: ChronicleView }) {
  const a = view.accentHex;
  if (view.background === "plain") return null;
  if (view.background === "grid") {
    const lines = [];
    for (let x = 0; x <= W; x += 60) lines.push(<path key={`x${x}`} d={`M ${x} 0 V ${H}`} stroke={a} strokeOpacity={0.12} strokeWidth={2} />);
    for (let y = 0; y <= H; y += 60) lines.push(<path key={`y${y}`} d={`M 0 ${y} H ${W}`} stroke={a} strokeOpacity={0.12} strokeWidth={2} />);
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", top: 0, left: 0 }}>
        {lines}
      </svg>
    );
  }
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: W,
        height: H,
        display: "flex",
        backgroundImage: `radial-gradient(circle at 10% 5%, ${a}55 0%, transparent 45%), radial-gradient(circle at 95% 55%, ${a}33 0%, transparent 40%), radial-gradient(circle at 15% 100%, ${a}2a 0%, transparent 40%)`,
      }}
    />
  );
}

function Stop({ stop, view, right, top, photo }: { stop: ChronicleStop; view: ChronicleView; right: boolean; top: number; photo: string | null }) {
  const a = view.accentHex;
  const imgBox = { width: STOP_W - 64, height: 116 };
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: right ? W - PAD - STOP_W : PAD,
        width: STOP_W,
        height: STOP_H,
        display: "flex",
        flexDirection: "column",
        padding: "20px 28px",
        borderRadius: 32,
        backgroundColor: CARD,
        border: "2px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 58, fontWeight: 700, color: a, lineHeight: 1 }}>{stop.gotLabel}</div>
        {view.showAges && stop.age != null && (
          <div style={{ display: "flex", fontSize: 26, color: "white", padding: "6px 18px", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.12)" }}>
            Age {stop.age}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", ...imgBox, marginTop: 10 }}>
        {photo && stop.art ? (
          <img
            src={photo}
            width={Math.round(Math.min(imgBox.width, (imgBox.height * stop.art.width) / stop.art.height))}
            height={Math.round(Math.min(imgBox.height, (imgBox.width * stop.art.height) / stop.art.width))}
            alt=""
          />
        ) : stop.art ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 300, height: 130, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.92)" }}>
            <img src={stop.art.src} width={260} height={110} style={{ objectFit: "contain" }} alt="" />
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: "white", lineHeight: 1.15 }}>
          {stop.platformName}
          {stop.model ? ` · ${stop.model}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8, minHeight: 34 }}>
        {stop.badges.map((b) => (
          <div key={b} style={{ display: "flex", alignItems: "center", fontSize: 20, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: CANVAS, backgroundColor: a, padding: "5px 14px", borderRadius: 999 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill={CANVAS} style={{ marginRight: 8 }}>
              <path d={STAR_PATH} />
            </svg>
            {BADGE_LABELS[b]}
          </div>
        ))}
        {stop.badges.length === 0 && stop.note && (
          <div style={{ display: "flex", fontSize: 24, fontStyle: "italic", color: FOG }}>“{stop.note}”</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: "auto" }}>
        {stop.games.map((g) =>
          g.coverUrl ? (
            <img key={g.igdbId} src={g.coverUrl} width={72} height={96} style={{ borderRadius: 8, objectFit: "cover" }} alt="" />
          ) : (
            <div key={g.igdbId} style={{ display: "flex", width: 72, height: 96, borderRadius: 8, backgroundImage: "linear-gradient(160deg, #2b3b55, #141b26)" }} />
          )
        )}
      </div>
    </div>
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const page = Math.max(1, Math.floor(Number(new URL(request.url).searchParams.get("page")) || 1));
  const user = await prisma.user.findUnique({
    where: { username: normalizeUsername(decodeURIComponent(username)) },
    select: { id: true, name: true, username: true },
  });
  if (!user?.username) return new Response("Not found", { status: 404 });

  const [chronicle, entries] = await Promise.all([
    prisma.chronicle.findUnique({ where: { userId: user.id }, select: { updatedAt: true } }),
    prisma.chronicleEntry.aggregate({ where: { userId: user.id }, _max: { updatedAt: true }, _count: true }),
  ]);
  const pages = Math.ceil(entries._count / STORY_PER_PAGE);
  if (!chronicle || pages === 0 || page > pages) return new Response("Not found", { status: 404 });

  const cacheKey = JSON.stringify([user, page, chronicle.updatedAt.getTime(), entries._count, entries._max.updatedAt?.getTime()]);
  const hit = rendered.get(cacheKey);
  if (hit) {
    rendered.delete(cacheKey);
    rendered.set(cacheKey, hit);
    return pngResponse(hit);
  }

  const view = await loadChronicle(user);
  const first = (page - 1) * STORY_PER_PAGE;
  const stops = view.stops.slice(first, first + STORY_PER_PAGE);
  const photos = await Promise.all(stops.map((s) => (s.art?.kind === "photo" ? photoDataUrl(s.art.key) : null)));
  const firstYear = view.stops[0].year;
  const lastYear = view.stops[view.stops.length - 1].year;

  const image = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", backgroundColor: CANVAS, fontFamily: "Geist" }}>
        <Background view={view} />
        <Road view={view} page={page} pages={pages} stops={stops} first={first} />
        <div style={{ position: "absolute", top: PAD, left: PAD, right: PAD, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase", color: view.accentHex }}>
              Console chronicles
            </div>
            {pages > 1 && (
              <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: "white", padding: "8px 20px", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.12)" }}>
                {page} / {pages}
              </div>
            )}
          </div>
          <div style={{ display: "flex", fontSize: page === 1 ? 72 : 52, fontWeight: 700, color: "white", marginTop: 18, lineHeight: 1.05 }}>
            {view.title}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: FOG, marginTop: 14 }}>
            {view.name} · {view.stops.length} console{view.stops.length === 1 ? "" : "s"}
            {firstYear !== lastYear ? ` · ${firstYear}–${lastYear}` : ` · ${firstYear}`}
          </div>
        </div>
        {stops.map((stop, i) => (
          <Stop key={stop.id} stop={stop} view={view} right={(first + i) % 2 === 1} top={cardTop(i)} photo={photos[i]} />
        ))}
        {page === pages && stops.length < STORY_PER_PAGE && (
          <NextStop view={view} x={centreX((first + stops.length) % 2 === 1)} y={cardTop(stops.length) + 130} />
        )}
        <div style={{ position: "absolute", bottom: 48, left: PAD, right: PAD, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: 8, color: "white" }}>BEATEN</div>
          <div style={{ display: "flex", fontSize: 26, color: FOG }}>{`beaten.games/${user.username}/chronicles`}</div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: await loadFonts() }
  );
  const png = await image.arrayBuffer();
  remember(cacheKey, png);
  return pngResponse(png);
}
