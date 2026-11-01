// Renders a console chronicle as a 1080x1920 MP4 for Instagram stories,
// entirely in the browser: each frame is drawn to a canvas in the map's
// style, then encoded with the device's H.264 encoder (WebCodecs) and
// packed into an MP4. Where WebCodecs isn't available it falls back to
// recording the canvas in real time (MediaRecorder).
//
// Styles: "road" (here) lays the timeline out as one tall "world" and a
// camera glides down the zig-zag road, each console sliding in as the road
// reaches it; "years" and "crt" are in chronicle-video-styles.ts. The iPhone
// app renders the same styles natively (ios/Beaten/Features/Extras/Video);
// change one, change the other.

import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import type { ChronicleStop, ChronicleView, VideoStyle } from "./chronicle-core";
import { BADGE_LABELS } from "./chronicle-core";
import { crtPlan, yearsPlan } from "./chronicle-video-styles";

export const W = 1080;
export const H = 1920;
const FPS = 30;
export const CANVAS = "#0e1216";
export const CARD = "#161c22";
export const FOG = "#8fa0b0";
export const FONT = `-apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

export const MARGIN = 48;
const CARD_W = 780;
const CARD_PAD = 44;
const GAP = 220; // road between cards
const HEADER_H = 600;
const PHOTO_H = 330;
const COVER_W = 188;
const COVER_H = 250;

const INTRO = 1.6;
const OUTRO = 2.6;

// ImageBitmaps, which a Web Worker can draw as well as the page.
export type Images = Map<string, ImageBitmap>;
type Card = { stop: ChronicleStop; x: number; y: number; h: number; right: boolean };

export const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export async function loadImage(src: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(src, { mode: "cors" });
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

// Sharper covers than the page uses: the video is full-screen.
export const bigCover = (url: string) => url.replace("/t_cover_big/", "/t_cover_big_2x/");

async function loadImages(view: ChronicleView): Promise<Images> {
  const srcs = new Set<string>();
  for (const s of view.stops) {
    if (s.art) srcs.add(s.art.src);
    for (const g of s.games) if (g.coverUrl) srcs.add(bigCover(g.coverUrl));
  }
  const images: Images = new Map();
  await Promise.all(
    [...srcs].map(async (src) => {
      const img = await loadImage(src);
      if (img) images.set(src, img);
    })
  );
  return images;
}

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Fits text to a width with an ellipsis.
export function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

function cardHeight(stop: ChronicleStop): number {
  let h = CARD_PAD + 96 + 18 + PHOTO_H + 24 + 56;
  if (stop.model) h += 42;
  if (stop.badges.length) h += 52;
  if (stop.note) h += 44;
  if (stop.games.length) h += 24 + COVER_H;
  return h + CARD_PAD;
}

function layout(view: ChronicleView): { cards: Card[]; worldH: number } {
  let y = HEADER_H;
  const cards = view.stops.map((stop, i) => {
    const right = i % 2 === 1;
    const h = cardHeight(stop);
    const card = { stop, x: right ? W - MARGIN - CARD_W : MARGIN, y, h, right };
    y += h + GAP;
    return card;
  });
  return { cards, worldH: y - GAP + 400 };
}

export function drawBackground(ctx: CanvasRenderingContext2D, view: ChronicleView, cameraY: number) {
  ctx.fillStyle = CANVAS;
  ctx.fillRect(0, 0, W, H);
  const a = view.accentHex;
  if (view.background === "glow") {
    for (const [x, y, r, alpha] of [
      [100, 200, 900, "40"],
      [1000, 1200, 900, "2a"],
      [200, 1900, 800, "22"],
    ] as const) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `${a}${alpha}`);
      g.addColorStop(1, `${a}00`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  } else if (view.background === "grid") {
    ctx.strokeStyle = `${a}22`;
    ctx.lineWidth = 2;
    const step = 64;
    const off = -(cameraY * 0.5) % step;
    ctx.beginPath();
    for (let x = 0; x <= W; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = off; y <= H; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
  }
}

function roadPath(ctx: CanvasRenderingContext2D, from: Card, to: Card) {
  const x1 = from.x + CARD_W / 2;
  const y1 = from.y + from.h;
  const x2 = to.x + CARD_W / 2;
  const y2 = to.y;
  const mid = (y1 + y2) / 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1, mid, x2, mid, x2, y2);
}

// A road segment drawn `progress` (0-1) of the way along.
function drawRoad(ctx: CanvasRenderingContext2D, view: ChronicleView, from: Card, to: Card, progress: number) {
  if (progress <= 0) return;
  const a = view.accentHex;
  ctx.save();
  ctx.lineCap = view.path === "pixel" ? "butt" : "round";
  // Reveal by clipping to the drawn part (dashes stay put while it grows).
  const y1 = from.y + from.h;
  const y2 = to.y;
  ctx.beginPath();
  ctx.rect(0, y1 - 20, W, (y2 - y1 + 40) * progress);
  ctx.clip();
  if (view.path === "neon") {
    roadPath(ctx, from, to);
    ctx.strokeStyle = `${a}44`;
    ctx.lineWidth = 26;
    ctx.stroke();
    roadPath(ctx, from, to);
    ctx.strokeStyle = a;
    ctx.lineWidth = 7;
    ctx.shadowColor = a;
    ctx.shadowBlur = 24;
    ctx.stroke();
  } else if (view.path === "pixel") {
    roadPath(ctx, from, to);
    ctx.setLineDash([20, 20]);
    ctx.strokeStyle = a;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 16;
    ctx.stroke();
  } else {
    roadPath(ctx, from, to);
    ctx.setLineDash([1, 30]);
    ctx.strokeStyle = a;
    ctx.lineWidth = 12;
    ctx.stroke();
  }
  ctx.restore();
  // Joins where the road meets each card.
  for (const [x, y, show] of [
    [from.x + CARD_W / 2, from.y + from.h, true],
    [to.x + CARD_W / 2, to.y, progress >= 1],
  ] as const) {
    if (!show) continue;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fillStyle = CANVAS;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = a;
    ctx.stroke();
  }
}

export function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + rad * Math.cos(ang), cy + rad * Math.sin(ang));
  }
  ctx.closePath();
  ctx.fill();
}

function drawCard(ctx: CanvasRenderingContext2D, view: ChronicleView, card: Card, images: Images, appear: number) {
  if (appear <= 0) return;
  const { stop } = card;
  const a = view.accentHex;
  const e = ease(appear);
  ctx.save();
  ctx.globalAlpha = e;
  ctx.translate(0, (1 - e) * 60);

  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  rr(ctx, card.x, card.y, CARD_W, card.h, 36);
  ctx.fillStyle = CARD;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.stroke();

  const left = card.x + CARD_PAD;
  const inner = CARD_W - CARD_PAD * 2;
  let y = card.y + CARD_PAD;

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = a;
  ctx.font = `700 96px ${FONT}`;
  ctx.fillText(stop.gotLabel, left, y + 84);
  if (view.showAges && stop.age != null) {
    ctx.font = `500 34px ${FONT}`;
    const label = `Age ${stop.age}`;
    const w = ctx.measureText(label).width + 44;
    rr(ctx, left + inner - w, y + 18, w, 58, 29);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.fillText(label, left + inner - w + 22, y + 59);
  }
  y += 96 + 18;

  const art = stop.art ? images.get(stop.art.src) : null;
  if (art && stop.art) {
    if (stop.art.kind === "photo") {
      const scale = Math.min(inner / art.width, PHOTO_H / art.height);
      const w = art.width * scale;
      const h = art.height * scale;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 14;
      ctx.drawImage(art, left + (inner - w) / 2, y + (PHOTO_H - h) / 2, w, h);
      ctx.restore();
    } else {
      rr(ctx, left, y, inner, PHOTO_H, 24);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fill();
      const scale = Math.min((inner - 80) / art.width, (PHOTO_H - 60) / art.height);
      const w = art.width * scale;
      const h = art.height * scale;
      ctx.drawImage(art, left + (inner - w) / 2, y + (PHOTO_H - h) / 2, w, h);
    }
  } else {
    rr(ctx, left, y, inner, PHOTO_H, 24);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fill();
  }
  y += PHOTO_H + 24;

  if (stop.badges.length) {
    let x = left;
    ctx.font = `700 24px ${FONT}`;
    for (const b of stop.badges) {
      const label = BADGE_LABELS[b].toUpperCase();
      const w = ctx.measureText(label).width + 76;
      rr(ctx, x, y, w, 42, 21);
      ctx.fillStyle = a;
      ctx.fill();
      ctx.fillStyle = CANVAS;
      drawStar(ctx, x + 26, y + 21, 11);
      ctx.fillText(label, x + 46, y + 30);
      x += w + 12;
    }
    y += 52;
  }

  ctx.font = `600 46px ${FONT}`;
  ctx.fillStyle = "white";
  ctx.fillText(fit(ctx, stop.platformName, inner), left, y + 42);
  y += 56;
  if (stop.model) {
    ctx.font = `400 30px ${FONT}`;
    ctx.fillStyle = FOG;
    ctx.fillText(fit(ctx, stop.model, inner), left, y + 30);
    y += 42;
  }

  if (stop.note) {
    ctx.font = `italic 400 32px ${FONT}`;
    ctx.fillStyle = FOG;
    ctx.fillText(fit(ctx, `“${stop.note}”`, inner), left, y + 32);
    y += 44;
  }

  if (stop.games.length) {
    y += 24;
    stop.games.forEach((g, i) => {
      const x = left + i * (COVER_W + 24);
      const img = g.coverUrl ? images.get(bigCover(g.coverUrl)) : null;
      ctx.save();
      rr(ctx, x, y, COVER_W, COVER_H, 14);
      ctx.clip();
      if (img) {
        const scale = Math.max(COVER_W / img.width, COVER_H / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, x + (COVER_W - w) / 2, y + (COVER_H - h) / 2, w, h);
      } else {
        const g2 = ctx.createLinearGradient(x, y, x + COVER_W, y + COVER_H);
        g2.addColorStop(0, "#2b3b55");
        g2.addColorStop(1, "#141b26");
        ctx.fillStyle = g2;
        ctx.fillRect(x, y, COVER_W, COVER_H);
      }
      ctx.restore();
    });
  }
  ctx.restore();
}

function drawHeader(ctx: CanvasRenderingContext2D, view: ChronicleView, appear: number) {
  const e = ease(appear);
  ctx.save();
  ctx.globalAlpha = e;
  ctx.translate(0, (1 - e) * 40);
  ctx.textAlign = "center";
  ctx.fillStyle = view.accentHex;
  ctx.font = `700 30px ${FONT}`;
  ctx.letterSpacing = "8px";
  ctx.fillText("CONSOLE CHRONICLES", W / 2, 230);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "white";
  ctx.font = `700 84px ${FONT}`;
  ctx.fillText(fit(ctx, view.title, W - 2 * MARGIN), W / 2, 340);
  const first = view.stops[0];
  const last = view.stops[view.stops.length - 1];
  ctx.fillStyle = FOG;
  ctx.font = `400 36px ${FONT}`;
  const years = first ? (first.year !== last.year ? `${first.year}–${last.year}` : `${first.year}`) : "";
  ctx.fillText(`${view.name} · ${view.stops.length} console${view.stops.length === 1 ? "" : "s"}${years ? ` · ${years}` : ""}`, W / 2, 410);
  ctx.restore();
}

// Bottom strip: brand and link, over a fade so cards slide under it.
export function drawFooter(ctx: CanvasRenderingContext2D, view: ChronicleView) {
  const g = ctx.createLinearGradient(0, H - 260, 0, H);
  g.addColorStop(0, `${CANVAS}00`);
  g.addColorStop(0.6, `${CANVAS}ee`);
  g.addColorStop(1, CANVAS);
  ctx.fillStyle = g;
  ctx.fillRect(0, H - 260, W, 260);
  ctx.fillStyle = "white";
  ctx.font = `700 34px ${FONT}`;
  ctx.letterSpacing = "10px";
  ctx.textAlign = "left";
  ctx.fillText("BEATEN", MARGIN, H - 80);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "right";
  ctx.fillStyle = FOG;
  ctx.font = `400 30px ${FONT}`;
  if (view.username) ctx.fillText(`beaten.games/${view.username}/chronicles`, W - MARGIN, H - 80);
  ctx.textAlign = "left";
}

export function drawOutro(ctx: CanvasRenderingContext2D, view: ChronicleView, t: number) {
  const e = ease(t);
  ctx.save();
  ctx.fillStyle = `rgba(14,18,22,${0.97 * e})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = e;
  ctx.textAlign = "center";
  ctx.fillStyle = view.accentHex;
  ctx.font = `700 160px ${FONT}`;
  ctx.fillText(String(view.stops.length), W / 2, H / 2 - 60);
  ctx.fillStyle = "white";
  ctx.font = `700 56px ${FONT}`;
  ctx.fillText(view.stops.length === 1 ? "console and counting" : "consoles and counting", W / 2, H / 2 + 30);
  if (view.username) {
    ctx.fillStyle = FOG;
    ctx.font = `400 38px ${FONT}`;
    ctx.fillText(`beaten.games/${view.username}/chronicles`, W / 2, H / 2 + 120);
  }
  ctx.restore();
}

export type VideoPlan = { duration: number; draw: (ctx: CanvasRenderingContext2D, time: number) => void };

// Seconds on each console: longer for short chronicles, quicker for long
// ones, keeping the whole thing inside an Instagram story's 60 seconds.
export function plan(view: ChronicleView, images: Images): VideoPlan {
  const { cards } = layout(view);
  const n = cards.length;
  const beat = Math.max(1.1, Math.min(2.2, (56 - INTRO - OUTRO) / Math.max(1, n)));
  const duration = INTRO + n * beat + OUTRO;

  // Where the camera looks (world y at the middle of the screen) for card i.
  const focus = (i: number) => (i < 0 ? H / 2 : Math.max(H / 2, cards[i].y + cards[i].h / 2 + 60));

  function draw(ctx: CanvasRenderingContext2D, time: number) {
    const t = time - INTRO;
    const i = Math.min(n - 1, Math.floor(t / beat)); // card being reached
    const local = t < 0 ? 0 : clamp01((t - i * beat) / beat);
    const move = ease(clamp01(local / 0.55));
    const centre = t < 0 ? H / 2 : focus(i - 1) + (focus(i) - focus(i - 1)) * move;
    const cameraY = centre - H / 2;

    drawBackground(ctx, view, cameraY);
    ctx.save();
    ctx.translate(0, -cameraY);
    drawHeader(ctx, view, clamp01(time / 0.9));
    cards.forEach((card, k) => {
      if (k > 0) {
        // The road into card k draws while the camera travels to it.
        const p = k < i ? 1 : k === i ? clamp01(local / 0.35) : 0;
        drawRoad(ctx, view, cards[k - 1], card, t < 0 ? 0 : p);
      }
    });
    cards.forEach((card, k) => {
      const appear = t < 0 ? 0 : k < i ? 1 : k === i ? clamp01((local - (k === 0 ? 0 : 0.18)) / 0.35) : 0;
      drawCard(ctx, view, card, images, appear);
    });
    ctx.restore();
    drawFooter(ctx, view);
    if (time > INTRO + n * beat) drawOutro(ctx, view, (time - INTRO - n * beat) / 0.8);
  }

  return { duration, draw };
}

export type Progress = (fraction: number) => void;

// "full": 1080x1920 for Instagram (which re-compresses to ~3.5 Mbps anyway).
// "small": 720x1280 at a bitrate worked out from the length, to land under
// Discord's (and most messengers') 10MB limit.
export type VideoSize = "full" | "small";
const SMALL_TARGET_BYTES = 9 * 1024 * 1024;

type Output = { width: number; height: number; bitrate: number; codecs: string[] };

function output(size: VideoSize, duration: number): Output {
  if (size === "small") {
    // 4% for the MP4 container and the encoder overshooting.
    const bitrate = Math.min(2_500_000, Math.floor((SMALL_TARGET_BYTES * 8 * 0.96) / duration));
    return { width: 720, height: 1280, bitrate, codecs: ["avc1.64001f", "avc1.4d001f", "avc1.42001f"] };
  }
  return { width: W, height: H, bitrate: 6_000_000, codecs: ["avc1.640028", "avc1.4d0028", "avc1.42002a"] };
}

// Plans are drawn at 1080x1920; smaller outputs scale every frame down.
function drawFrame(p: VideoPlan, ctx: CanvasRenderingContext2D, time: number) {
  const scale = ctx.canvas.width / W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  p.draw(ctx, time);
}

const onPage = typeof document !== "undefined";

async function encodeWithWebCodecs(p: VideoPlan, ctx: CanvasRenderingContext2D, out: Output, onProgress: Progress): Promise<Blob | null> {
  if (typeof VideoEncoder === "undefined") return null;
  let config: VideoEncoderConfig | null = null;
  for (const codec of out.codecs) {
    const c = { codec, width: out.width, height: out.height, bitrate: out.bitrate, framerate: FPS };
    if ((await VideoEncoder.isConfigSupported(c).catch(() => ({ supported: false }))).supported) {
      config = c;
      break;
    }
  }
  if (!config) return null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: out.width, height: out.height, frameRate: FPS },
    fastStart: "in-memory",
  });
  let failure: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure(config);

  const frames = Math.round(p.duration * FPS);
  for (let f = 0; f < frames; f++) {
    if (failure) throw failure;
    drawFrame(p, ctx, f / FPS);
    const frame = new VideoFrame(ctx.canvas, { timestamp: Math.round((f * 1_000_000) / FPS), duration: Math.round(1_000_000 / FPS) });
    encoder.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
    frame.close();
    // Keep the encoder's queue short (memory). On the page (no worker),
    // hand back control after every frame so it stays responsive.
    while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5));
    if (f % 10 === 0) onProgress(f / frames);
    if (onPage || f % 10 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  await encoder.flush();
  if (failure) throw failure;
  encoder.close();
  muxer.finalize();
  onProgress(1);
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}

// Fallback: play the animation and record it, in real time.
async function recordInRealTime(p: VideoPlan, ctx: CanvasRenderingContext2D, out: Output, onProgress: Progress): Promise<Blob> {
  const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  const stream = (ctx.canvas as HTMLCanvasElement).captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: out.bitrate });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (recorder.onstop = () => r()));
  recorder.start();
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const time = (performance.now() - start) / 1000;
      drawFrame(p, ctx, Math.min(time, p.duration));
      onProgress(Math.min(1, time / p.duration));
      if (time >= p.duration) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
  recorder.stop();
  await done;
  return new Blob(chunks, { type: recorder.mimeType });
}

// The plan for a chronicle in a style, with its artwork (and font) loaded.
export async function chroniclePlan(view: ChronicleView, style: VideoStyle): Promise<VideoPlan> {
  const images = await loadImages(view);
  if (style === "crt") await loadPixelFont();
  return style === "years" ? yearsPlan(view, images) : style === "crt" ? crtPlan(view, images) : plan(view, images);
}

export const chronicleVideoName = (style: VideoStyle, size: VideoSize) =>
  `console-chronicles${style === "road" ? "" : `-${style}`}${size === "small" ? "-small" : ""}`;

// Encodes a plan to MP4 bytes on an OffscreenCanvas (in a Web Worker: see
// video.worker.ts). Null when this browser can't encode there.
export async function encodeOffscreen(p: VideoPlan, size: VideoSize, onProgress: Progress): Promise<Blob | null> {
  if (typeof OffscreenCanvas === "undefined") return null;
  const out = output(size, p.duration);
  const canvas = new OffscreenCanvas(out.width, out.height);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D | null;
  if (!ctx) return null;
  return encodeWithWebCodecs(p, ctx, out, onProgress);
}

// Any 1080x1920 plan to a video file, on the page itself: the fallback when
// a worker can't do it.
export async function renderPlanVideo(p: VideoPlan, size: VideoSize, onProgress: Progress, name: string): Promise<File> {
  const out = output(size, p.duration);
  const canvas = document.createElement("canvas");
  canvas.width = out.width;
  canvas.height = out.height;
  const ctx = canvas.getContext("2d")!;
  const blob = (await encodeWithWebCodecs(p, ctx, out, onProgress)) ?? (await recordInRealTime(p, ctx, out, onProgress));
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  return new File([blob], `${name}.${ext}`, { type: blob.type });
}

// Press Start 2P (SIL OFL, public/fonts) for the Retro CRT style. Canvas
// text only uses a font once it has loaded.
export const PIXEL_FONT = '"Press Start 2P", monospace';

// The page's fonts, or a worker's (null where workers have none).
export function fontSet(): FontFaceSet | null {
  if (typeof document !== "undefined") return document.fonts;
  return (globalThis as unknown as { fonts?: FontFaceSet }).fonts ?? null;
}

async function loadPixelFont() {
  const fonts = fontSet();
  if (!fonts) throw new Error("no fonts here");
  if ([...fonts].some((f) => f.family === "Press Start 2P" && f.status === "loaded")) return;
  const face = new FontFace("Press Start 2P", "url(/fonts/PressStart2P-Regular.ttf)");
  fonts.add(await face.load());
}
