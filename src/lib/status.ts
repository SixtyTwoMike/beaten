// Play-log status is stored as a plain string in SQLite (no enums). These
// helpers are the single source of truth for the valid values, their labels,
// and their accent colors so components don't scatter string literals.

// SHELVED: put down without finishing (maybe for good: PlayLog.notReturning).
export type PlayStatus = "PLAYING" | "BEATEN" | "MASTERED" | "SHELVED";

export const PLAY_STATUSES: PlayStatus[] = ["PLAYING", "BEATEN", "MASTERED", "SHELVED"];

export function isPlayStatus(value: string): value is PlayStatus {
  return (PLAY_STATUSES as string[]).includes(value);
}

// Finished statuses usually have a finish date, but it may be unknown (a game
// beaten years ago): finishedAt is null then too. So "finished" is decided by
// status, never by finishedAt; PLAYING is in progress and SHELVED was put
// down unfinished (finishedAt null for both).
export const FINISHED_STATUSES: PlayStatus[] = ["BEATEN", "MASTERED"];

export function isFinishedStatus(value: string): boolean {
  return (FINISHED_STATUSES as string[]).includes(value);
}

export const STATUS_LABELS: Record<PlayStatus, string> = {
  PLAYING: "Playing",
  BEATEN: "Beaten",
  MASTERED: "Mastered",
  SHELVED: "Shelved",
};

// Tailwind accent token per status (see globals.css @theme).
export const STATUS_ACCENT: Record<PlayStatus, string> = {
  PLAYING: "sky",
  BEATEN: "mint",
  MASTERED: "gold",
  SHELVED: "fog",
};

// How far along a status is, for imports that may upgrade an entry (Playing
// or Shelved → Beaten → Mastered).
export const STATUS_RANK: Record<string, number> = { PLAYING: 0, SHELVED: 0, BEATEN: 1, MASTERED: 2 };
