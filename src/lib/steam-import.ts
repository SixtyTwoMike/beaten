import type { PlayStatus } from "./status";

// Steam has no "beaten" signal, so imports propose a status the user then
// confirms or changes on the review page:
// - every achievement unlocked → Mastered, dated by the last unlock;
// - played in the last month → Playing;
// - anything else → Shelved, dated by when it was last played.
// Beaten is always the user's call.

// Games with less playtime than this are hidden from review by default.
export const MIN_MINUTES = 60;
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;

type Stats = {
  playtimeMinutes: number;
  lastPlayedAt: Date | null;
  achTotal: number | null;
  achUnlocked: number | null;
  firstUnlockAt: Date | null;
  lastUnlockAt: Date | null;
};

export function isComplete(g: Stats): boolean {
  return Boolean(g.achTotal && g.achTotal > 0 && g.achUnlocked === g.achTotal);
}

export function proposeStatus(g: Stats, now = Date.now()): PlayStatus {
  if (isComplete(g)) return "MASTERED";
  if (g.lastPlayedAt && now - g.lastPlayedAt.getTime() < RECENT_MS) return "PLAYING";
  return "SHELVED";
}

const day = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const month = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

// The diary dates an import writes for a status. Steam doesn't say when a
// game was first played, so the first achievement stands in for the start.
// A Beaten finish is a guess (last achievement or last played), so it's
// kept to the month.
export type ImportDates = {
  startedAt?: Date;
  finishedAt?: Date | null;
  finishedPrecision?: string;
  stoppedAt?: Date | null;
};

export function importDates(g: Stats, status: PlayStatus): ImportDates {
  const started = g.firstUnlockAt ? { startedAt: day(g.firstUnlockAt) } : {};
  const lastSeen = g.lastUnlockAt && g.lastPlayedAt ? (g.lastUnlockAt > g.lastPlayedAt ? g.lastUnlockAt : g.lastPlayedAt) : (g.lastUnlockAt ?? g.lastPlayedAt);
  switch (status) {
    case "MASTERED":
      return { ...started, finishedAt: g.lastUnlockAt ? day(g.lastUnlockAt) : null };
    case "BEATEN":
      return { ...started, ...(lastSeen ? { finishedAt: month(lastSeen), finishedPrecision: "MONTH" } : { finishedAt: null }) };
    case "SHELVED":
      return { ...started, stoppedAt: g.lastPlayedAt ? day(g.lastPlayedAt) : null };
    case "PLAYING":
      return started;
  }
}

export function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = minutes / 60;
  return `${h < 10 ? h.toFixed(1).replace(/\.0$/, "") : Math.round(h).toLocaleString("en-GB")} h`;
}
