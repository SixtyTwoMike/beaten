import type { Game, PlayLog } from "@prisma/client";
import type { IgdbGame } from "./igdb";
import { toPartialInput } from "./format";

// JSON shapes the /api/v1 routes return (mirrored by ios/Beaten/API/Models.swift).
// Dates are partial ISO strings ("YYYY-MM-DD", "YYYY-MM" or "YYYY") at the
// precision they were entered; timestamps are full ISO.

// Lists leave out the summary (often a long paragraph per game); the app
// shows it from GET /games/:igdbId.
export function gameJson(game: Game | IgdbGame, { summary = true } = {}) {
  const platformIds = typeof game.platformIds === "string" ? (JSON.parse(game.platformIds) as number[]) : game.platformIds;
  return {
    igdbId: game.igdbId,
    name: game.name,
    coverUrl: game.coverUrl,
    artworkUrl: game.artworkUrl,
    releaseYear: game.releaseYear,
    summary: summary ? game.summary : null,
    platformIds,
  };
}

const partial = (d: Date | null, precision: string | null) => (d ? toPartialInput(d, precision) : null);

export function logJson(log: PlayLog & { game?: Game }, { summary = false } = {}) {
  return {
    id: log.id,
    status: log.status,
    platformId: log.platformId,
    startedAt: partial(log.startedAt, log.startedPrecision),
    finishedAt: partial(log.finishedAt, log.finishedPrecision),
    stoppedAt: partial(log.stoppedAt, log.stoppedPrecision),
    notReturning: log.notReturning,
    isReplay: log.isReplay,
    playedOn: log.playedOn,
    rating: log.rating,
    reviewText: log.reviewText,
    containsSpoilers: log.containsSpoilers,
    createdAt: log.createdAt.toISOString(),
    updatedAt: log.updatedAt.toISOString(),
    ...(log.game && { game: gameJson(log.game, { summary }) }),
  };
}
