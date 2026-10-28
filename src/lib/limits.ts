// Upper bounds on user-supplied text, enforced in server actions (and mirrored
// as maxLength on inputs). Keeps one script from filling the SQLite disk.

export const MAX_EMAIL = 254;
export const MAX_NAME = 50;
// bcrypt only uses the first 72 bytes of a password.
export const MAX_PASSWORD_BYTES = 72;
export const MAX_REVIEW = 5000;
export const MAX_SHELF_NAME = 60;
export const MAX_SHELF_DESCRIPTION = 500;
export const MAX_SHELVES_PER_LOG = 50;

export function isIgdbId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}
