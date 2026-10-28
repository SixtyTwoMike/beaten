// Profile pictures cropped from a finished game's cover or artwork. The crop
// is stored as a focal point (x/y, 0–100%) and zoom (1–3); the same layout
// maths drives the web avatar, the cropper and the generated share card.

export type AvatarSource = "cover" | "artwork";

// IGDB serves these sizes cropped to fixed dimensions (t_cover_big 264×374,
// t_screenshot_huge 1280×720), so the aspect ratios are known up front.
const ASPECT: Record<AvatarSource, number> = { cover: 264 / 374, artwork: 1280 / 720 };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

export type Avatar = { url: string; source: AvatarSource; x: number; y: number; zoom: number };

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function isAvatarSource(v: unknown): v is AvatarSource {
  return v === "cover" || v === "artwork";
}

// Where to draw the source image inside a size×size square: "cover" fit,
// scaled by zoom, offset so the focal point sits proportionally.
export function avatarLayout(size: number, a: Pick<Avatar, "source" | "x" | "y" | "zoom">) {
  const aspect = ASPECT[a.source];
  const zoom = clamp(a.zoom, MIN_ZOOM, MAX_ZOOM);
  const width = aspect < 1 ? size * zoom : size * zoom * aspect;
  const height = aspect < 1 ? (size * zoom) / aspect : size * zoom;
  return {
    width,
    height,
    left: ((size - width) * clamp(a.x, 0, 100)) / 100,
    top: ((size - height) * clamp(a.y, 0, 100)) / 100,
  };
}

type AvatarFields = {
  avatarSource: string | null;
  avatarX: number;
  avatarY: number;
  avatarZoom: number;
  avatarGame: { coverUrl: string | null; artworkUrl: string | null } | null;
};

export function resolveAvatar(user: AvatarFields): Avatar | null {
  if (!user.avatarGame || !isAvatarSource(user.avatarSource)) return null;
  const url = user.avatarSource === "cover" ? user.avatarGame.coverUrl : user.avatarGame.artworkUrl;
  if (!url) return null;
  return { url, source: user.avatarSource, x: user.avatarX, y: user.avatarY, zoom: user.avatarZoom };
}

// Prisma select for everything resolveAvatar needs.
export const AVATAR_SELECT = {
  avatarSource: true,
  avatarX: true,
  avatarY: true,
  avatarZoom: true,
  avatarGame: { select: { coverUrl: true, artworkUrl: true } },
} as const;
