// The "Year by year" and "Retro CRT" chronicle videos (the road style and
// the encoder are in chronicle-video.ts). Both are 1080x1920 plans: a
// duration plus a function drawing the frame at a given time. The iPhone
// app draws the same frames in Swift (ios/Beaten/Features/Extras/Video);
// keep the numbers here and there in step.

import type { ChronicleStop, ChronicleView } from "./chronicle-core";
import { BADGE_LABELS } from "./chronicle-core";
import {
  CANVAS,
  FOG,
  FONT,
  H,
  MARGIN,
  PIXEL_FONT,
  W,
  bigCover,
  clamp01,
  drawBackground,
  drawFooter,
  drawOutro,
  drawStar,
  ease,
  fit,
  rr,
  type Images,
  type VideoPlan,
} from "./chronicle-video";

const OUTRO = 2.6;

// Seconds per console, inside an Instagram story's 60 s.
function beatFor(n: number, intro: number, min: number, max: number) {
  return Math.max(min, Math.min(max, (56 - intro - OUTRO) / Math.max(1, n)));
}

// Overshoots then settles: things dropping in.
function easeOutBack(t: number) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

function drawImageIn(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, cover: boolean) {
  const scale = cover ? Math.max(w / img.naturalWidth, h / img.naturalHeight) : Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function coverOrBlank(ctx: CanvasRenderingContext2D, images: Images, url: string | null, x: number, y: number, w: number, h: number) {
  const img = url ? images.get(bigCover(url)) : null;
  if (img) drawImageIn(ctx, img, x, y, w, h, true);
  else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#2b3b55");
    g.addColorStop(1, "#141b26");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
}

function consoleArt(ctx: CanvasRenderingContext2D, stop: ChronicleStop, images: Images, x: number, y: number, w: number, h: number) {
  const art = stop.art ? images.get(stop.art.src) : null;
  if (art && stop.art?.kind === "photo") {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 20;
    drawImageIn(ctx, art, x, y, w, h, false);
    ctx.restore();
  } else if (art) {
    rr(ctx, x + w * 0.1, y, w * 0.8, h, 28);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();
    drawImageIn(ctx, art, x + w * 0.1 + 50, y + 40, w * 0.8 - 100, h - 80, false);
  } else {
    ctx.fillStyle = "white";
    ctx.font = `700 64px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(fit(ctx, stop.platformName, w), x + w / 2, y + h / 2);
    ctx.textAlign = "left";
  }
}

// --- Year by year ---------------------------------------------------------
//
// 1.2 s title, then per console: the year rolls over from the last one
// (first 35% of the beat), the console drops in with a bounce (15–50%),
// the covers pop in one after another (40–75%), and the last 12% slides it
// all away to the left. Outro as the road video.

const YEARS_INTRO = 1.2;

export function yearsPlan(view: ChronicleView, images: Images): VideoPlan {
  const stops = view.stops;
  const n = stops.length;
  const beat = beatFor(n, YEARS_INTRO, 1.6, 2.6);
  const duration = YEARS_INTRO + n * beat + OUTRO;
  const a = view.accentHex;

  function title(ctx: CanvasRenderingContext2D, t: number) {
    const e = ease(t);
    ctx.save();
    ctx.globalAlpha = e;
    ctx.translate(0, (1 - e) * 40);
    ctx.textAlign = "center";
    ctx.fillStyle = a;
    ctx.font = `700 30px ${FONT}`;
    ctx.letterSpacing = "8px";
    ctx.fillText("CONSOLE CHRONICLES", W / 2, H / 2 - 120);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = "white";
    ctx.font = `700 92px ${FONT}`;
    ctx.fillText(fit(ctx, view.title, W - 2 * MARGIN), W / 2, H / 2);
    ctx.fillStyle = FOG;
    ctx.font = `400 38px ${FONT}`;
    ctx.fillText(view.name, W / 2, H / 2 + 80);
    ctx.restore();
  }

  function stopFrame(ctx: CanvasRenderingContext2D, i: number, local: number) {
    const stop = stops[i];
    const prevYear = i > 0 ? stops[i - 1].year : stop.year - 3;
    const leave = ease(clamp01((local - 0.88) / 0.12));
    ctx.save();
    ctx.globalAlpha = 1 - leave;
    ctx.translate(-leave * 260, 0);

    // Year counter.
    const roll = ease(clamp01(local / 0.35));
    const shown = Math.round(prevYear + (stop.year - prevYear) * roll);
    ctx.textAlign = "center";
    ctx.fillStyle = a;
    ctx.font = `800 250px ${FONT}`;
    ctx.fillText(String(shown), W / 2, 520);
    if (view.showAges && stop.age != null) {
      ctx.fillStyle = "white";
      ctx.font = `600 50px ${FONT}`;
      ctx.globalAlpha = (1 - leave) * clamp01((local - 0.25) / 0.15);
      ctx.fillText(`AGE ${stop.age}`, W / 2, 610);
      ctx.globalAlpha = 1 - leave;
    }

    // Console drops in.
    const drop = easeOutBack(clamp01((local - 0.15) / 0.35));
    if (drop > 0) {
      ctx.save();
      ctx.globalAlpha = (1 - leave) * clamp01(drop * 3);
      consoleArt(ctx, stop, images, 130, 700 - (1 - drop) * 260, 820, 460);
      ctx.restore();
    }

    // Name, badges, note.
    const words = clamp01((local - 0.3) / 0.15);
    ctx.globalAlpha = (1 - leave) * words;
    ctx.fillStyle = "white";
    ctx.font = `700 64px ${FONT}`;
    ctx.fillText(fit(ctx, stop.platformName, W - 2 * MARGIN), W / 2, 1270);
    let y = 1330;
    if (stop.badges.length) {
      ctx.font = `700 26px ${FONT}`;
      const labels = stop.badges.map((b) => BADGE_LABELS[b].toUpperCase());
      const widths = labels.map((l) => ctx.measureText(l).width + 80);
      let x = W / 2 - (widths.reduce((s, w) => s + w, 0) + (labels.length - 1) * 14) / 2;
      ctx.textAlign = "left";
      labels.forEach((l, k) => {
        rr(ctx, x, y - 34, widths[k], 46, 23);
        ctx.fillStyle = a;
        ctx.fill();
        ctx.fillStyle = CANVAS;
        drawStar(ctx, x + 28, y - 11, 12);
        ctx.fillText(l, x + 50, y - 1);
        x += widths[k] + 14;
      });
      ctx.textAlign = "center";
      y += 56;
    }
    if (stop.note) {
      ctx.fillStyle = FOG;
      ctx.font = `italic 400 38px ${FONT}`;
      ctx.fillText(fit(ctx, `“${stop.note}”`, W - 2 * MARGIN), W / 2, y);
    }
    ctx.globalAlpha = 1 - leave;

    // Covers pop in, staggered.
    const cw = 250;
    const ch = 333;
    const gap = 30;
    const count = stop.games.length;
    const x0 = W / 2 - (count * cw + (count - 1) * gap) / 2;
    stop.games.forEach((g, k) => {
      const pop = easeOutBack(clamp01((local - 0.4 - k * 0.08) / 0.2));
      if (pop <= 0) return;
      const x = x0 + k * (cw + gap);
      const cy = 1440 + ch / 2;
      ctx.save();
      ctx.translate(x + cw / 2, cy);
      ctx.scale(pop, pop);
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 12;
      rr(ctx, -cw / 2, -ch / 2, cw, ch, 18);
      ctx.fillStyle = CANVAS;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.clip();
      coverOrBlank(ctx, images, g.coverUrl, -cw / 2, -ch / 2, cw, ch);
      ctx.restore();
    });
    ctx.restore();
    ctx.textAlign = "left";
  }

  function draw(ctx: CanvasRenderingContext2D, time: number) {
    drawBackground(ctx, view, time * 40);
    const t = time - YEARS_INTRO;
    if (t < 0) {
      title(ctx, clamp01(time / 0.6));
    } else {
      const i = Math.min(n - 1, Math.floor(t / beat));
      if (n) stopFrame(ctx, i, clamp01((t - i * beat) / beat));
    }
    drawFooter(ctx, view);
    if (time > YEARS_INTRO + n * beat) drawOutro(ctx, view, (time - YEARS_INTRO - n * beat) / 0.8);
  }

  return { duration, draw };
}

// --- Retro CRT ------------------------------------------------------------
//
// An old telly: a bezel round a curved screen, scanlines, a glow, and a
// pixel font. 0.5 s of static, a title card, then per console a channel
// ("CH 01") with the year, console and covers in chunky frames; the last
// 0.3 s of each is static. Outro: "END OF TRANSMISSION".

const CRT_INTRO = 1.6;
const STATIC = 0.3;
// The screen, inside the bezel. Literal numbers: this module and
// chronicle-video.ts import each other, so its constants aren't set yet
// while this one loads.
const SX = 70;
const SY = 230;
const SW = 940; // W - 2 * SX
const SH = 1360;

// Repeatable noise, so the same chronicle makes the same video.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawStatic(ctx: CanvasRenderingContext2D, frame: number) {
  const r = rng(frame * 7919 + 1);
  const cell = 12;
  for (let y = SY; y < SY + SH; y += cell) {
    for (let x = SX; x < SX + SW; x += cell) {
      const v = Math.floor(r() * 255);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

function pixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left") {
  ctx.font = `${size}px ${PIXEL_FONT}`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  // Fits by stepping the size down: the pixel font is wide.
  while (ctx.measureText(text).width > SW - 80 && size > 16) {
    size -= 4;
    ctx.font = `${size}px ${PIXEL_FONT}`;
  }
  ctx.fillText(text, x, y);
  ctx.textAlign = "left";
}

function chunkyFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x - 10, y - 10, w + 20, h + 20);
  ctx.fillStyle = "#000";
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
}

function drawTelly(ctx: CanvasRenderingContext2D, accent: string) {
  // Scanlines and a soft vignette over the picture.
  ctx.save();
  rr(ctx, SX, SY, SW, SH, 70);
  ctx.clip();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  for (let y = SY; y < SY + SH; y += 6) ctx.fillRect(SX, y, SW, 3);
  const v = ctx.createRadialGradient(W / 2, SY + SH / 2, SH * 0.3, W / 2, SY + SH / 2, SH * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.65)");
  ctx.fillStyle = v;
  ctx.fillRect(SX, SY, SW, SH);
  ctx.restore();

  // Bezel: everything outside the screen.
  const bezel = new Path2D();
  bezel.rect(0, 0, W, H);
  bezel.roundRect(SX, SY, SW, SH, 70);
  ctx.fillStyle = "#17191c";
  ctx.fill(bezel, "evenodd");
  ctx.strokeStyle = "#2a2e33";
  ctx.lineWidth = 8;
  rr(ctx, SX - 4, SY - 4, SW + 8, SH + 8, 74);
  ctx.stroke();
  // Glass glint.
  ctx.save();
  rr(ctx, SX, SY, SW, SH, 70);
  ctx.clip();
  const glint = ctx.createLinearGradient(SX, SY, SX + SW * 0.6, SY + SH * 0.4);
  glint.addColorStop(0, "rgba(255,255,255,0.08)");
  glint.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glint;
  ctx.fillRect(SX, SY, SW, SH);
  ctx.restore();

  // Brand plate and knobs below the screen.
  pixelText(ctx, "BEATEN", MARGIN + 40, SY + SH + 130, 34, "#c9ced4");
  for (const [x, c] of [
    [W - 260, "#2a2e33"],
    [W - 150, "#2a2e33"],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, SY + SH + 118, 34, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(W - 360, SY + SH + 118, 9, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
}

export function crtPlan(view: ChronicleView, images: Images): VideoPlan {
  const stops = view.stops;
  const n = stops.length;
  const beat = beatFor(n, CRT_INTRO, 1.8, 2.8);
  const duration = CRT_INTRO + n * beat + OUTRO;
  const a = view.accentHex;
  const cx = W / 2;

  function screen(ctx: CanvasRenderingContext2D) {
    const g = ctx.createLinearGradient(0, SY, 0, SY + SH);
    g.addColorStop(0, "#0b1410");
    g.addColorStop(1, `${a}22`);
    ctx.fillStyle = "#050807";
    ctx.fillRect(SX, SY, SW, SH);
    ctx.fillStyle = g;
    ctx.fillRect(SX, SY, SW, SH);
  }

  function titleCard(ctx: CanvasRenderingContext2D, t: number) {
    const blink = Math.floor(t * 2) % 2 === 0;
    pixelText(ctx, "CONSOLE", cx, SY + 470, 64, a, "center");
    pixelText(ctx, "CHRONICLES", cx, SY + 570, 64, a, "center");
    pixelText(ctx, view.title.toUpperCase(), cx, SY + 760, 32, "white", "center");
    pixelText(ctx, view.name.toUpperCase(), cx, SY + 830, 24, "#9fb3a8", "center");
    if (blink) pixelText(ctx, "PRESS START", cx, SY + 1100, 28, "white", "center");
  }

  function channel(ctx: CanvasRenderingContext2D, i: number, local: number) {
    const stop = stops[i];
    pixelText(ctx, `CH ${String(i + 1).padStart(2, "0")}`, SX + 60, SY + 110, 36, a);
    if (view.showAges && stop.age != null) pixelText(ctx, `AGE ${stop.age}`, SX + SW - 60, SY + 110, 28, "white", "right");
    pixelText(ctx, String(stop.year), cx, SY + 300, 120, "white", "center");

    const reveal = clamp01(local / 0.15);
    ctx.save();
    ctx.globalAlpha = reveal;
    const ax = SX + 140;
    const aw = SW - 280;
    chunkyFrame(ctx, ax, SY + 360, aw, 400, a);
    ctx.fillStyle = "#101614";
    ctx.fillRect(ax, SY + 360, aw, 400);
    consoleArt(ctx, stop, images, ax + 30, SY + 380, aw - 60, 360);
    ctx.restore();

    pixelText(ctx, stop.platformName.toUpperCase(), cx, SY + 860, 34, a, "center");
    if (stop.note) pixelText(ctx, `"${stop.note.toUpperCase()}"`, cx, SY + 920, 20, "#c9d6cf", "center");

    const cw = 210;
    const ch = 280;
    const gap = 50;
    const count = stop.games.length;
    const x0 = cx - (count * cw + (count - 1) * gap) / 2;
    stop.games.forEach((g, k) => {
      if (local < 0.25 + k * 0.1) return;
      const x = x0 + k * (cw + gap);
      chunkyFrame(ctx, x, SY + 990, cw, ch, "white");
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, SY + 990, cw, ch);
      ctx.clip();
      coverOrBlank(ctx, images, g.coverUrl, x, SY + 990, cw, ch);
      ctx.restore();
    });
  }

  function outro(ctx: CanvasRenderingContext2D, t: number) {
    pixelText(ctx, "END OF", cx, SY + 520, 56, a, "center");
    pixelText(ctx, "TRANSMISSION", cx, SY + 610, 56, a, "center");
    pixelText(ctx, `${n} CONSOLE${n === 1 ? "" : "S"} AND COUNTING`, cx, SY + 790, 28, "white", "center");
    if (view.username) pixelText(ctx, `BEATEN.GAMES/${view.username.toUpperCase()}`, cx, SY + 880, 22, "#9fb3a8", "center");
    // The picture shrinking to a dot, as an old set switching off.
    if (t > 0.6) {
      const k = clamp01((t - 0.6) / 0.4);
      ctx.fillStyle = "#000";
      ctx.fillRect(SX, SY, SW, SH * 0.5 * k);
      ctx.fillRect(SX, SY + SH - SH * 0.5 * k, SW, SH * 0.5 * k);
    }
  }

  function draw(ctx: CanvasRenderingContext2D, time: number) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    rr(ctx, SX, SY, SW, SH, 70);
    ctx.clip();
    screen(ctx);
    const frame = Math.floor(time * 30);
    const t = time - CRT_INTRO;
    const end = n * beat;
    if (time < 0.5) drawStatic(ctx, frame);
    else if (t < 0) titleCard(ctx, time - 0.5);
    else if (t < end) {
      const i = Math.min(n - 1, Math.floor(t / beat));
      const into = t - i * beat;
      if (into < 0.12 && i === 0) drawStatic(ctx, frame);
      else if (beat - into < STATIC) drawStatic(ctx, frame);
      else channel(ctx, i, into / beat);
    } else outro(ctx, (t - end) / OUTRO);
    ctx.restore();
    drawTelly(ctx, a);
  }

  return { duration, draw };
}
