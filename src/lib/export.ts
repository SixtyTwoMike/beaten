import { prisma } from "./db";
import { ratingToStars, toPartialInput } from "./format";
import { variantOf } from "./console-art";
import { getPlatforms } from "./platforms";

// Everything a user has put into Beaten, for the "Download your data"
// exports. Internal security fields (password hash, session version, tokens)
// are deliberately left out.

export async function buildExport(userId: string) {
  const [user, logs, shelves, platforms, chronicle] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        email: true,
        username: true,
        name: true,
        createdAt: true,
        emailVerifiedAt: true,
        instagram: true,
        bluesky: true,
        raAccount: { select: { raUsername: true } },
        steamAccount: { select: { steamId: true } },
        following: { orderBy: { createdAt: "asc" }, select: { createdAt: true, followee: { select: { username: true } } } },
        comments: {
          orderBy: { createdAt: "asc" },
          select: {
            body: true,
            createdAt: true,
            playLog: { select: { user: { select: { username: true } }, game: { select: { name: true, igdbId: true } } } },
          },
        },
        reactions: {
          orderBy: { createdAt: "asc" },
          select: {
            kind: true,
            createdAt: true,
            playLog: { select: { user: { select: { username: true } }, game: { select: { name: true, igdbId: true } } } },
          },
        },
      },
    }),
    prisma.playLog.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }],
      include: { game: true },
    }),
    prisma.shelf.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { items: { orderBy: { addedAt: "asc" }, include: { game: true } } },
    }),
    getPlatforms(),
    prisma.chronicle.findUnique({
      where: { userId },
      include: {
        entries: {
          orderBy: [{ gotAt: "asc" }, { createdAt: "asc" }],
          include: { games: { orderBy: { position: "asc" }, include: { game: true } } },
        },
      },
    }),
  ]);
  const platformName = new Map(platforms.map((p) => [p.id, p.name]));

  const shelfNamesByGame = new Map<string, string[]>();
  for (const shelf of shelves) {
    for (const item of shelf.items) {
      shelfNamesByGame.set(item.gameId, [...(shelfNamesByGame.get(item.gameId) ?? []), shelf.name]);
    }
  }

  return {
    format: "beaten-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: {
      email: user.email,
      username: user.username,
      displayName: user.name,
      memberSince: user.createdAt.toISOString(),
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      instagram: user.instagram,
      bluesky: user.bluesky,
      retroAchievements: user.raAccount?.raUsername ?? null,
      steamId: user.steamAccount?.steamId ?? null,
    },
    following: user.following
      .filter((f) => f.followee.username)
      .map((f) => ({ username: f.followee.username, since: f.createdAt.toISOString() })),
    // Comments and reactions on other people's reviews (and replies on yours).
    comments: user.comments.map((c) => ({
      onReviewBy: c.playLog.user.username,
      game: c.playLog.game,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    })),
    reactions: user.reactions.map((r) => ({
      onReviewBy: r.playLog.user.username,
      game: r.playLog.game,
      reaction: r.kind,
      createdAt: r.createdAt.toISOString(),
    })),
    logs: logs.map((log) => ({
      game: {
        igdbId: log.game.igdbId,
        name: log.game.name,
        releaseYear: log.game.releaseYear,
        slug: log.game.slug,
      },
      status: log.status,
      platform: log.platformId ? (platformName.get(log.platformId) ?? null) : null,
      platformId: log.platformId,
      // YYYY-MM-DD, or YYYY-MM / YYYY when only the month or year was given.
      startedAt: log.startedAt ? toPartialInput(log.startedAt, log.startedPrecision) : null,
      finishedAt: log.finishedAt ? toPartialInput(log.finishedAt, log.finishedPrecision) : null,
      // Shelved entries: when it was put down, and whether for good.
      stoppedAt: log.stoppedAt ? toPartialInput(log.stoppedAt, log.stoppedPrecision) : null,
      notReturning: log.notReturning,
      isReplay: log.isReplay,
      // 1-10 half-star steps; ratingStars is the same on a 0.5-5 scale.
      rating: log.rating,
      ratingStars: log.rating != null ? Number(ratingToStars(log.rating)) : null,
      review: log.reviewText,
      shelves: shelfNamesByGame.get(log.gameId) ?? [],
      createdAt: log.createdAt.toISOString(),
      updatedAt: log.updatedAt.toISOString(),
    })),
    shelves: shelves.map((shelf) => ({
      name: shelf.name,
      description: shelf.description,
      createdAt: shelf.createdAt.toISOString(),
      games: shelf.items.map((item) => ({
        igdbId: item.game.igdbId,
        name: item.game.name,
        addedAt: item.addedAt.toISOString(),
      })),
    })),
    consoleChronicle: chronicle && {
      title: chronicle.title,
      birthYear: chronicle.birthYear,
      showAges: chronicle.showAges,
      consoles: chronicle.entries.map((e) => ({
        platform: variantOf(e.platformId, e.variant)?.name ?? platformName.get(e.platformId) ?? null,
        platformId: e.platformId,
        model: e.model,
        gotAt: toPartialInput(e.gotAt, e.gotPrecision),
        age: e.age,
        note: e.note,
        topGames: e.games.map((g) => ({ igdbId: g.game.igdbId, name: g.game.name })),
      })),
    },
  };
}

export type BeatenExport = Awaited<ReturnType<typeof buildExport>>;

// Quote every field; neutralise leading = + - @ so spreadsheet apps don't
// treat review text as a formula.
function csvField(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function diaryCsv(data: BeatenExport): string {
  const header = [
    "Game", "Release year", "IGDB ID", "Status", "Platform", "Started",
    "Finished", "Put down", "Not going back", "Rating (stars)", "Replay", "Review", "Shelves",
  ];
  const rows = data.logs.map((log) => [
    log.game.name, log.game.releaseYear, log.game.igdbId, log.status, log.platform,
    log.startedAt, log.finishedAt, log.stoppedAt, log.notReturning ? "yes" : "", log.ratingStars, log.isReplay ? "yes" : "no",
    log.review, log.shelves.join("; "),
  ]);
  // BOM so Excel opens UTF-8 (accented game names) correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}
