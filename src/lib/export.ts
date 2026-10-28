import { prisma } from "./db";
import { ratingToStars, toDateInput } from "./format";
import { getPlatforms } from "./platforms";

// Everything a user has put into Beaten, for the "Download your data"
// exports. Internal security fields (password hash, session version, tokens)
// are deliberately left out.

export async function buildExport(userId: string) {
  const [user, logs, shelves, platforms] = await Promise.all([
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
    },
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
      startedAt: log.startedAt ? toDateInput(log.startedAt) : null,
      finishedAt: log.finishedAt ? toDateInput(log.finishedAt) : null,
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
    "Finished", "Rating (stars)", "Replay", "Review", "Shelves",
  ];
  const rows = data.logs.map((log) => [
    log.game.name, log.game.releaseYear, log.game.igdbId, log.status, log.platform,
    log.startedAt, log.finishedAt, log.ratingStars, log.isReplay ? "yes" : "no",
    log.review, log.shelves.join("; "),
  ]);
  // BOM so Excel opens UTF-8 (accented game names) correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}
