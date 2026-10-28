// Upper bounds on user-supplied text, enforced in server actions (and mirrored
// as maxLength on inputs). Keeps one script from filling the SQLite disk.

export const MAX_EMAIL = 254;
export const MAX_NAME = 50;
export const MAX_REVIEW = 5000;
export const MAX_SHELF_NAME = 60;
export const MAX_SHELF_DESCRIPTION = 500;
export const MAX_SHELVES_PER_LOG = 50;

// IGDB ids are stored as SQLite INT4; anything larger can't be a real id.
const MAX_INT4 = 2147483647;

export function isIgdbId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= MAX_INT4;
}

// Diary year filter range.
export const MIN_YEAR = 1950;
export const MAX_YEAR = 2100;
