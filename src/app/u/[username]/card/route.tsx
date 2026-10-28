/* eslint-disable @next/next/no-img-element -- ImageResponse (satori) markup, not the DOM */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { normalizeUsername } from "@/lib/username";
import { AVATAR_SELECT, avatarLayout, resolveAvatar } from "@/lib/avatar";
import {
  CARD_ACCENTS,
  CARD_FORMATS,
  CARD_HEADINGS,
  parseCardOptions,
  type CardOptions,
} from "@/lib/share-card";
import { STAR_PATH } from "@/components/Stars";

// Public share card: a PNG of someone's last four finished (or played) games. Uses only
// what their public profile already shows. Cached for 10 minutes (nginx
// caches it too), since rendering is the most expensive thing the box does.

const CARD_GAMES = 4;
const CANVAS = "#0e1216";
const FOG = "#8fa0b0";

type Font = { name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" };
let fonts: Promise<Font[]> | null = null;

function loadFonts(): Promise<Font[]> {
  const dir = path.join(process.cwd(), "src/assets/fonts");
  fonts ??= Promise.all(
    ([
      ["Geist-Regular.ttf", 400],
      ["Geist-SemiBold.ttf", 600],
      ["Geist-Bold.ttf", 700],
    ] as const).map(async ([file, weight]) => ({
      name: "Geist",
      data: await readFile(path.join(dir, file)),
      weight,
      style: "normal" as const,
    }))
  );
  return fonts;
}

function Stars({ rating, size, color }: { rating: number; size: number; color: string }) {
  const pct = Math.max(0, Math.min(100, rating * 10));
  const row = (fill: string) =>
    [0, 1, 2, 3, 4].map((i) => (
      <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={fill}>
        <path d={STAR_PATH} />
      </svg>
    ));
  return (
    <div style={{ display: "flex", position: "relative", width: size * 5, height: size }}>
      <div style={{ display: "flex" }}>{row("rgba(255,255,255,0.18)")}</div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          top: 0,
          width: (size * 5 * pct) / 100,
          height: size,
          overflow: "hidden",
        }}
      >
        {row(color)}
      </div>
    </div>
  );
}

type CardGame = {
  name: string;
  coverUrl: string | null;
  rating: number | null;
  finishedAt: Date | null;
  status: string;
};

function Cover({ game, width }: { game: CardGame; width: number }) {
  const height = Math.round((width * 374) / 264);
  const frame = {
    width,
    height,
    borderRadius: 14,
    boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
  };
  if (game.coverUrl) {
    return <img src={game.coverUrl} width={width} height={height} style={{ ...frame, objectFit: "cover" }} alt="" />;
  }
  return (
    <div
      style={{
        ...frame,
        display: "flex",
        alignItems: "flex-end",
        padding: 16,
        backgroundImage: "linear-gradient(160deg, #2b3b55, #141b26)",
        color: "white",
        fontSize: width / 9,
        fontWeight: 600,
      }}
    >
      {game.name}
    </div>
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const opts: CardOptions = parseCardOptions(new URL(request.url).searchParams);
  const user = await prisma.user.findUnique({
    where: { username: normalizeUsername(decodeURIComponent(username)) },
    select: { id: true, username: true, name: true, image: true, ...AVATAR_SELECT },
  });
  if (!user?.username) return new Response("Not found", { status: 404 });

  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const played = opts.source === "played";
  const [rawLogs, beatenGames, thisYear] = await Promise.all([
    prisma.playLog.findMany({
      where: { userId: user.id, ...(played ? {} : { finishedAt: { not: null } }) },
      orderBy: played ? [{ createdAt: "desc" }] : [{ finishedAt: "desc" }, { createdAt: "desc" }],
      take: played ? 60 : 20,
      include: { game: { select: { id: true, name: true, coverUrl: true, artworkUrl: true } } },
    }),
    prisma.playLog.findMany({
      where: { userId: user.id, finishedAt: { not: null } },
      select: { gameId: true },
      distinct: ["gameId"],
    }),
    prisma.playLog.count({ where: { userId: user.id, finishedAt: { gte: yearStart } } }),
  ]);

  // "Played" orders by each log's latest date (finished, else started, else
  // logged), so a game you've just picked up comes before an old finish.
  const lastActive = (l: (typeof rawLogs)[number]) =>
    (l.finishedAt ?? l.startedAt ?? l.createdAt).getTime();
  const logs = played ? [...rawLogs].sort((a, b) => lastActive(b) - lastActive(a)) : rawLogs;

  // Most recent log per game, newest first.
  const seen = new Set<string>();
  const games: (CardGame & { artworkUrl: string | null })[] = [];
  for (const log of logs) {
    if (seen.has(log.game.id)) continue;
    seen.add(log.game.id);
    games.push({ ...log.game, rating: log.rating, finishedAt: log.finishedAt, status: log.status });

    if (games.length === CARD_GAMES) break;
  }

  const { width, height } = CARD_FORMATS[opts.format];
  const accent = CARD_ACCENTS[opts.accent];
  const story = opts.format === "story";
  const wide = opts.format === "wide";
  const pad = wide ? 52 : 72;
  const gap = story ? 44 : wide ? 24 : 28;
  const coverWidth = story ? 360 : wide ? 196 : Math.floor((width - 2 * pad - 3 * gap) / 4);
  const display = user.name || `@${user.username}`;
  const avatar = resolveAvatar(user);
  const avatarSize = wide ? 64 : story ? 112 : 88;
  const backdrop = opts.background === "art" ? games.find((g) => g.artworkUrl)?.artworkUrl ?? games[0]?.coverUrl : null;

  const avatarEl = (() => {
    const ring = { borderRadius: 9999, border: `3px solid ${accent}` };
    if (avatar) {
      const l = avatarLayout(avatarSize, avatar);
      return (
        <div style={{ ...ring, display: "flex", position: "relative", width: avatarSize, height: avatarSize, overflow: "hidden" }}>
          <img
            src={avatar.url}
            width={l.width}
            height={l.height}
            style={{ position: "absolute", left: l.left, top: l.top, width: l.width, height: l.height }}
            alt=""
          />
        </div>
      );
    }
    if (user.image) {
      return <img src={user.image} width={avatarSize} height={avatarSize} style={{ ...ring, objectFit: "cover" }} alt="" />;
    }
    return (
      <div
        style={{
          ...ring,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: avatarSize,
          height: avatarSize,
          backgroundColor: "#1d2530",
          color: FOG,
          fontSize: avatarSize * 0.42,
          fontWeight: 700,
        }}
      >
        {display.replace(/^@/, "").charAt(0).toUpperCase()}
      </div>
    );
  })();

  const who = (
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      {opts.avatar && avatarEl}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: wide ? 30 : story ? 46 : 38, fontWeight: 700, color: "white" }}>{display}</div>
        <div style={{ fontSize: wide ? 20 : story ? 28 : 24, color: FOG }}>{`@${user.username}`}</div>
      </div>
    </div>
  );

  const stats = opts.stats && (
    <div style={{ display: "flex", gap: 36 }}>
      {[
        [beatenGames.length, "games beaten"],
        [thisYear, `in ${yearStart.getUTCFullYear()}`],
      ].map(([value, label]) => (
        <div key={String(label)} style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: wide ? 30 : story ? 54 : 44, fontWeight: 700, color: accent }}>{String(value)}</div>
          <div style={{ display: "flex", fontSize: wide ? 16 : story ? 24 : 20, color: FOG, textTransform: "uppercase", letterSpacing: 2 }}>
            {String(label)}
          </div>
        </div>
      ))}
    </div>
  );

  const logo = (
    <div style={{ fontSize: wide ? 26 : story ? 40 : 34, fontWeight: 600, letterSpacing: "0.18em", color: "white" }}>
      BEATEN
    </div>
  );

  const grid = (
    <div style={{ display: "flex", flexWrap: "wrap", gap, justifyContent: story ? "center" : "flex-start" }}>
      {games.length === 0 ? (
        <div style={{ fontSize: 32, color: FOG }}>{played ? "Nothing logged yet — watch this space." : "Nothing beaten yet — watch this space."}</div>
      ) : (
        games.map((g, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", width: coverWidth, gap: 10 }}>
            <Cover game={g} width={coverWidth} />
            <div
              style={{
                display: "flex",
                // Two lines at most (one on the link preview); longer names are cut.
                maxHeight: (wide ? 1 : 2) * 1.25 * (wide ? 18 : story ? 28 : 22),
                overflow: "hidden",
                fontSize: wide ? 18 : story ? 28 : 22,
                fontWeight: 600,
                color: "white",
                lineHeight: 1.25,
              }}
            >
              {g.name}
            </div>
            {(opts.ratings || opts.dates || !g.finishedAt) && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {opts.ratings && g.rating != null && (
                  <Stars rating={g.rating} size={wide ? 15 : story ? 26 : 20} color={accent} />
                )}
                {opts.dates && g.finishedAt && (
                  <div style={{ fontSize: wide ? 15 : story ? 24 : 18, color: FOG }}>{formatDate(g.finishedAt)}</div>
                )}
                {!g.finishedAt && (
                  <div
                    style={{
                      display: "flex",
                      fontSize: wide ? 13 : story ? 20 : 15,
                      fontWeight: 600,
                      color: accent,
                      textTransform: "uppercase",
                      letterSpacing: 1.5,
                    }}
                  >
                    Playing
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );

  const heading = (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 10, height: wide ? 30 : story ? 52 : 42, borderRadius: 4, backgroundColor: accent }} />
      <div style={{ fontSize: wide ? 34 : story ? 64 : 52, fontWeight: 700, color: "white" }}>{CARD_HEADINGS[opts.heading]}</div>
    </div>
  );

  const footer = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: wide ? 18 : story ? 28 : 22, color: FOG }}>
      <div>{`beaten.games/u/${user.username}`}</div>
      {!wide && logo}
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width,
          height,
          display: "flex",
          position: "relative",
          backgroundColor: CANVAS,
          fontFamily: "Geist",
        }}
      >
        {backdrop && (
          <img
            src={backdrop}
            width={width}
            height={height}
            style={{ position: "absolute", top: 0, left: 0, width, height, objectFit: "cover", opacity: 0.45 }}
            alt=""
          />
        )}
        {backdrop && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width,
              height,
              display: "flex",
              backgroundImage: `linear-gradient(180deg, rgba(14,18,22,0.55) 0%, rgba(14,18,22,0.82) 45%, ${CANVAS} 100%)`,
            }}
          />
        )}
        {!backdrop && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width,
              height,
              display: "flex",
              backgroundImage: `radial-gradient(circle at 15% 0%, ${accent}40, transparent 55%), radial-gradient(circle at 100% 100%, ${accent}26, transparent 50%)`,
            }}
          />
        )}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width,
            height,
            padding: pad,
          }}
        >
          {wide ? (
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flexGrow: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {who}
                {logo}
              </div>
              {heading}
              {grid}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                {footer}
                {stats}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flexGrow: 1 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: story ? 56 : 36 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {who}
                  {story ? null : stats}
                </div>
                {story && stats}
                {heading}
              </div>
              {grid}
              {footer}
            </div>
          )}
        </div>
      </div>
    ),
    {
      width,
      height,
      fonts: await loadFonts(),
      headers: { "Cache-Control": "public, max-age=600" },
    }
  );

}
