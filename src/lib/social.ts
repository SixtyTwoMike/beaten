// Instagram / Bluesky handles: accept what people paste (@name, full profile
// URLs) and store a normalised handle. Links are built from the handle, never
// from user-supplied URLs.

export type SocialResult = { ok: true; handle: string | null } | { ok: false; error: string };

function stripPrefix(raw: string, hosts: RegExp): string {
  let v = raw.trim();
  v = v.replace(/^https?:\/\//i, "").replace(hosts, "");
  v = v.replace(/^@/, "").replace(/[/?#].*$/, "");
  return v.toLowerCase();
}

export function normalizeInstagram(raw: string): SocialResult {
  const v = stripPrefix(raw, /^(www\.)?instagram\.com\//i);
  if (!v) return { ok: true, handle: null };
  if (!/^[a-z0-9._]{1,30}$/.test(v) || v.startsWith(".") || v.endsWith(".") || v.includes("..")) {
    return { ok: false, error: "That doesn't look like an Instagram username" };
  }
  return { ok: true, handle: v };
}

// Bluesky handles are domains: name.bsky.social or a custom domain.
// A bare name is assumed to be on bsky.social.
export function normalizeBluesky(raw: string): SocialResult {
  let v = stripPrefix(raw, /^(www\.)?bsky\.app\/profile\//i);
  if (!v) return { ok: true, handle: null };
  if (!v.includes(".")) v = `${v}.bsky.social`;
  const label = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  const parts = v.split(".");
  if (v.length > 253 || parts.length < 2 || !parts.every((p) => label.test(p)) || /^\d+$/.test(parts.at(-1)!)) {
    return { ok: false, error: "That doesn't look like a Bluesky handle" };
  }
  return { ok: true, handle: v };
}

export const instagramUrl = (handle: string) => `https://www.instagram.com/${handle}/`;
export const blueskyUrl = (handle: string) => `https://bsky.app/profile/${handle}`;
