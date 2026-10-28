// Usernames are the public handle in /u/<username>. Stored lowercase so
// lookups and uniqueness are case-insensitive.

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

// Returns an error message, or null when the (normalized) username is valid.
export function usernameError(username: string): string | null {
  if (!USERNAME_RE.test(username)) {
    return "Username must be 3–20 characters: letters, numbers, or _";
  }
  return null;
}
