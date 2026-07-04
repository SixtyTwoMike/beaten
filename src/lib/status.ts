// Play-log status is stored as a plain string in SQLite (no enums). These
// helpers are the single source of truth for the valid values, their labels,
// and their accent colors so components don't scatter string literals.

export type PlayStatus = "PLAYING" | "BEATEN" | "MASTERED";

export const PLAY_STATUSES: PlayStatus[] = ["PLAYING", "BEATEN", "MASTERED"];

export function isPlayStatus(value: string): value is PlayStatus {
  return (PLAY_STATUSES as string[]).includes(value);
}

// A finished status has a finish date; PLAYING is in-progress (finishedAt null).
export function isFinishedStatus(value: string): boolean {
  return value === "BEATEN" || value === "MASTERED";
}

export const STATUS_LABELS: Record<PlayStatus, string> = {
  PLAYING: "Playing",
  BEATEN: "Beaten",
  MASTERED: "Mastered",
};

// Tailwind accent token per status (see globals.css @theme).
export const STATUS_ACCENT: Record<PlayStatus, string> = {
  PLAYING: "sky",
  BEATEN: "mint",
  MASTERED: "gold",
};
