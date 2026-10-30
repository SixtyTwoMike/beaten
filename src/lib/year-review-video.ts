// The Year in review story video: 1080x1920, a plan (duration + draw) for
// the encoder in chronicle-video.ts. The iPhone app draws the same frames
// (ios/Beaten/Features/Extras/Video/YearReviewVideo.swift); keep the
// numbers in step.
//
//   0–1.6 s      "MY <year> IN GAMES", the year bouncing in
//   +3.0 s       games finished counting up, then beaten / mastered
//   +3.2 s       highlights: first game finished, most productive month
//                (skipped when there's neither)
//   wall         up to 12 covers flying into a 4×3 grid, 0.28 s apart
//   favourites   the best-rated three, 1.8 s each
//   outro 2.4 s  the total and the profile link

import {
  CANVAS,
  FOG,
  FONT,
  H,
  MARGIN,
  W,
  bigCover,
  clamp01,
  ease,
  fit,
  loadImage,
  rr,
  type Images,
  type VideoPlan,
} from "./chronicle-video";
import { MONTHS, dayMonth } from "./format";
import type { YearReview } from "./year-review";

const ACCENT = "#00d474";
const GOLD = "#ffb43a";
const INTRO = 1.6;
const STATS = 3.0;
const HIGHLIGHTS = 3.2;

const WALL_STEP = 0.28;
const WALL_HOLD = 1.2;
const FAVE = 1.8;
const OUTRO = 2.4;
const WALL_MAX = 12;
const COLS = 4;
const CW = 225;
const CH = 300;
const GAP = 20;

function easeOutBack(t: number) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

export async function loadReviewImages(review: YearReview): Promise<Images> {
  const srcs = new Set(review.games.flatMap((g) => (g.coverUrl ? [bigCover(g.coverUrl)] : [])));
  const images: Images = new Map();
  await Promise.all(
    [...srcs].map(async (src) => {
      const img = await loadImage(src);
      if (img) images.set(src, img);
    })
  );
  return images;
}

function cover(ctx: CanvasRenderingContext2D, images: Images, url: string | null, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();
  const img = url ? images.get(bigCover(url)) : null;
  if (img) {
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#2b3b55");
    g.addColorStop(1, "#141b26");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: number, color: string) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + rad * Math.cos(ang), cy + rad * Math.sin(ang));
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fill();
  if (fill > 0) {
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(cx - r, cy - r, 2 * r * fill, 2 * r);
  }
  ctx.restore();
}

function background(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = CANVAS;
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, alpha] of [
    [100, 200, 900, "40"],
    [1000, 1200, 900, "2a"],
    [200, 1900, 800, "22"],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `${ACCENT}${alpha}`);
    g.addColorStop(1, `${ACCENT}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function footer(ctx: CanvasRenderingContext2D, review: YearReview) {
  ctx.fillStyle = "white";
  ctx.font = `700 34px ${FONT}`;
  ctx.letterSpacing = "10px";
  ctx.textAlign = "left";
  ctx.fillText("BEATEN", MARGIN, H - 80);
  ctx.letterSpacing = "0px";
  if (review.username) {
    ctx.textAlign = "right";
    ctx.fillStyle = FOG;
    ctx.font = `400 30px ${FONT}`;
    ctx.fillText(`beaten.games/${review.username}`, W - MARGIN, H - 80);
  }
  ctx.textAlign = "left";
}

export function yearReviewPlan(review: YearReview, images: Images): VideoPlan {
  const wallGames = review.games.slice(-WALL_MAX).reverse(); // latest first
  const hasGames = review.finished > 0;
  const wall = hasGames ? wallGames.length * WALL_STEP + WALL_HOLD : 0;
  const faves = review.top.length * FAVE;
  const highlights = hasGames && (review.firstGame || review.bestMonth) ? HIGHLIGHTS : 0;
  const tHighlights = INTRO + STATS;
  const tWall = tHighlights + highlights;
  const tFaves = tWall + wall;
  const tOutro = tFaves + faves;
  const duration = tOutro + OUTRO;
  const cx = W / 2;

  function intro(ctx: CanvasRenderingContext2D, t: number) {
    ctx.textAlign = "center";
    const a = ease(clamp01(t / 0.4));
    ctx.globalAlpha = a;
    ctx.fillStyle = "white";
    ctx.font = `700 64px ${FONT}`;
    ctx.letterSpacing = "12px";
    ctx.fillText("MY", cx, 700);
    ctx.fillText("IN GAMES", cx, 1150);
    ctx.letterSpacing = "0px";
    const pop = easeOutBack(clamp01((t - 0.2) / 0.6));
    ctx.save();
    ctx.translate(cx, 960);
    ctx.scale(pop, pop);
    ctx.fillStyle = ACCENT;
    ctx.font = `800 300px ${FONT}`;
    ctx.fillText(String(review.year), 0, 100);
    ctx.restore();
    ctx.fillStyle = FOG;
    ctx.font = `400 40px ${FONT}`;
    ctx.fillText(review.name, cx, 1260);
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  function stats(ctx: CanvasRenderingContext2D, t: number) {
    ctx.textAlign = "center";
    if (!hasGames) {
      ctx.fillStyle = "white";
      ctx.font = `700 64px ${FONT}`;
      ctx.fillText("Nothing finished yet", cx, 900);
      ctx.fillStyle = FOG;
      ctx.font = `400 40px ${FONT}`;
      ctx.fillText(`${review.year}'s story is still being written.`, cx, 980);
      ctx.textAlign = "left";
      return;
    }
    const count = Math.round(review.finished * ease(clamp01(t / 1.2)));
    ctx.fillStyle = ACCENT;
    ctx.font = `800 340px ${FONT}`;
    ctx.fillText(String(count), cx, 900);
    ctx.fillStyle = "white";
    ctx.font = `700 64px ${FONT}`;
    ctx.fillText(review.finished === 1 ? "game finished" : "games finished", cx, 1000);

    const pills: [string, string][] = [];
    if (review.beaten) pills.push([`${review.beaten} beaten`, ACCENT]);
    if (review.mastered) pills.push([`${review.mastered} mastered`, GOLD]);
    const show = ease(clamp01((t - 1.4) / 0.4));
    ctx.globalAlpha = show;
    ctx.font = `700 44px ${FONT}`;
    const widths = pills.map(([l]) => ctx.measureText(l).width + 70);
    let x = cx - (widths.reduce((s, w) => s + w, 0) + (pills.length - 1) * 24) / 2;
    pills.forEach(([label, color], k) => {
      rr(ctx, x, 1090, widths[k], 84, 42);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = CANVAS;
      ctx.textAlign = "left";
      ctx.fillText(label, x + 35, 1148);
      x += widths[k] + 24;
    });
    ctx.textAlign = "center";
    ctx.globalAlpha = ease(clamp01((t - 2.0) / 0.4));
    if (review.replays) {
      ctx.fillStyle = FOG;
      ctx.font = `400 38px ${FONT}`;
      ctx.fillText(`including ${review.replays} replay${review.replays === 1 ? "" : "s"}`, cx, 1250);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  function highlightsFrame(ctx: CanvasRenderingContext2D, t: number) {
    ctx.textAlign = "center";
    const label = (text: string, y: number) => {
      ctx.fillStyle = FOG;
      ctx.font = `700 36px ${FONT}`;
      ctx.letterSpacing = "8px";
      ctx.fillText(text, cx, y);
      ctx.letterSpacing = "0px";
    };
    const first = review.firstGame;
    if (first) {
      const a = ease(clamp01(t / 0.4));
      ctx.save();
      ctx.globalAlpha = a;
      label("FIRST GAME FINISHED", 360);
      const pop = easeOutBack(clamp01(t / 0.5));
      ctx.save();
      ctx.translate(cx, 610);
      ctx.scale(pop, pop);
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 16;
      rr(ctx, -150, -200, 300, 400, 20);
      ctx.fillStyle = CANVAS;
      ctx.fill();
      ctx.shadowColor = "transparent";
      cover(ctx, images, first.coverUrl, -150, -200, 300, 400, 20);
      ctx.restore();
      ctx.fillStyle = "white";
      ctx.font = `700 56px ${FONT}`;
      ctx.fillText(fit(ctx, first.name, W - 2 * MARGIN), cx, 890);
      ctx.fillStyle = FOG;
      ctx.font = `400 38px ${FONT}`;
      ctx.fillText(dayMonth(first.finishedAt), cx, 950);
      ctx.restore();
    }
    const best = review.bestMonth;
    if (best) {
      const b = ease(clamp01((t - (first ? 1.0 : 0)) / 0.4));
      ctx.save();
      ctx.globalAlpha = b;
      ctx.translate(0, (1 - b) * 40);
      label("MOST PRODUCTIVE MONTH", 1130);
      ctx.fillStyle = ACCENT;
      ctx.font = `800 120px ${FONT}`;
      ctx.fillText(MONTHS[best.month - 1], cx, 1290);
      ctx.fillStyle = "white";
      ctx.font = `600 44px ${FONT}`;
      ctx.fillText(best.count === 1 ? "1 game finished" : `${best.count} games finished`, cx, 1370);
      ctx.restore();
    }
    ctx.textAlign = "left";
  }

  function wallFrame(ctx: CanvasRenderingContext2D, t: number) {
    ctx.textAlign = "center";
    ctx.fillStyle = "white";
    ctx.font = `700 44px ${FONT}`;
    ctx.letterSpacing = "8px";
    ctx.fillText("EVERYTHING I FINISHED", cx, 380);
    ctx.letterSpacing = "0px";
    ctx.textAlign = "left";
    const rows = Math.ceil(wallGames.length / COLS);
    const top = 470 + ((3 - rows) * (CH + GAP)) / 2;
    wallGames.forEach((g, k) => {
      const land = easeOutBack(clamp01((t - k * WALL_STEP) / 0.35));
      if (land <= 0) return;
      const col = k % COLS;
      const row = Math.floor(k / COLS);
      const inRow = Math.min(COLS, wallGames.length - row * COLS);
      const left = cx - (inRow * CW + (inRow - 1) * GAP) / 2;
      const x = left + col * (CW + GAP);
      const y = top + row * (CH + GAP);
      const s = 1.6 - 0.6 * land;
      ctx.save();
      ctx.globalAlpha = clamp01(land * 2);
      ctx.translate(x + CW / 2, y + CH / 2);
      ctx.scale(s, s);
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 10;
      rr(ctx, -CW / 2, -CH / 2, CW, CH, 14);
      ctx.fillStyle = CANVAS;
      ctx.fill();
      ctx.shadowColor = "transparent";
      cover(ctx, images, g.coverUrl, -CW / 2, -CH / 2, CW, CH, 14);
      ctx.restore();
    });
    const more = review.finished - wallGames.length;
    if (more > 0 && t > wallGames.length * WALL_STEP) {
      ctx.globalAlpha = ease(clamp01((t - wallGames.length * WALL_STEP) / 0.3));
      ctx.textAlign = "center";
      ctx.fillStyle = FOG;
      ctx.font = `600 44px ${FONT}`;
      ctx.fillText(`+ ${more} more`, cx, top + 3 * (CH + GAP) + 70);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }
  }

  function fave(ctx: CanvasRenderingContext2D, k: number, local: number) {
    const g = review.top[k];
    const enter = ease(clamp01(local / 0.25));
    const leave = ease(clamp01((local - 0.85) / 0.15));
    ctx.save();
    ctx.globalAlpha = enter * (1 - leave);
    ctx.translate((1 - enter) * 300 - leave * 300, 0);
    ctx.textAlign = "center";
    ctx.fillStyle = "white";
    ctx.font = `700 44px ${FONT}`;
    ctx.letterSpacing = "8px";
    ctx.fillText("MY FAVOURITES", cx, 340);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = ACCENT;
    ctx.font = `800 120px ${FONT}`;
    ctx.fillText(`#${k + 1}`, cx, 500);
    const w = 480;
    const h = 640;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 20;
    rr(ctx, cx - w / 2, 560, w, h, 26);
    ctx.fillStyle = CANVAS;
    ctx.fill();
    ctx.restore();
    cover(ctx, images, g.coverUrl, cx - w / 2, 560, w, h, 26);
    ctx.fillStyle = "white";
    ctx.font = `700 60px ${FONT}`;
    ctx.fillText(fit(ctx, g.name, W - 2 * MARGIN), cx, 1300);
    const rating = (g.rating ?? 0) / 2;
    for (let i = 0; i < 5; i++) star(ctx, cx - 2 * 74 + i * 74, 1380, 30, clamp01(rating - i), ACCENT);
    ctx.restore();
    ctx.textAlign = "left";
  }

  function outro(ctx: CanvasRenderingContext2D, t: number) {
    const e = ease(clamp01(t / 0.6));
    ctx.save();
    ctx.globalAlpha = e;
    ctx.textAlign = "center";
    ctx.fillStyle = ACCENT;
    ctx.font = `800 160px ${FONT}`;
    ctx.fillText(String(review.year), cx, H / 2 - 60);
    ctx.fillStyle = "white";
    ctx.font = `700 60px ${FONT}`;
    ctx.fillText(review.finished === 1 ? "1 game finished" : `${review.finished} games finished`, cx, H / 2 + 40);
    if (review.username) {
      ctx.fillStyle = FOG;
      ctx.font = `400 38px ${FONT}`;
      ctx.fillText(`beaten.games/${review.username}`, cx, H / 2 + 130);
    }
    ctx.restore();
    ctx.textAlign = "left";
  }

  function draw(ctx: CanvasRenderingContext2D, time: number) {
    background(ctx);
    if (time < INTRO) intro(ctx, time);
    else if (time < tHighlights) stats(ctx, time - INTRO);
    else if (time < tWall) highlightsFrame(ctx, time - tHighlights);
    else if (time < tFaves) wallFrame(ctx, time - tWall);
    else if (time < tOutro) {
      const k = Math.min(review.top.length - 1, Math.floor((time - tFaves) / FAVE));
      fave(ctx, k, (time - tFaves - k * FAVE) / FAVE);
    } else outro(ctx, time - tOutro);
    footer(ctx, review);
  }

  return { duration, draw };
}
