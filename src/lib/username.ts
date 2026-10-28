// Usernames are the public handle in /<username>. Stored lowercase so
// lookups and uniqueness are case-insensitive.

import { USERNAME_CHANGE_DAYS } from "./limits";
import { isProfane, isRouteName } from "./username-rules";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

// Returns an error message, or null when the (normalized) username is valid.
// Reserved names are checked separately (reserved-usernames.ts), since that
// needs the database.
export function usernameError(username: string): string | null {
  if (!USERNAME_RE.test(username)) {
    return "Username must be 3–20 characters: letters, numbers, or _";
  }
  if (isRouteName(username)) return "That username isn't available";
  if (isProfane(username)) return "Please choose a different username";
  return null;
}

// When the username may next be changed, or null if it can be now.
export function nextUsernameChange(user: {
  username: string | null;
  usernameChangedAt: Date | null;
}): Date | null {
  if (!user.username || !user.usernameChangedAt) return null;
  const next = new Date(user.usernameChangedAt.getTime() + USERNAME_CHANGE_DAYS * 24 * 60 * 60 * 1000);
  return next > new Date() ? next : null;
}
