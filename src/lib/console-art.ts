import photos from "./console-images.json";

// The picture for a console in Console Chronicles: a photo of the hardware
// for the popular ones (public/consoles, built by scripts/console-images.mjs
// from Wikimedia Commons; credited on /credits), else its IGDB logo.

export type ConsoleArt = { kind: "photo" | "logo"; key: string; src: string; width: number; height: number };

// Models that are their own console to people but one IGDB platform:
// listed separately in Console Chronicles, each with its own photo
// (public/consoles/<id>-<key>).
export const CONSOLE_VARIANTS: Record<number, { key: string; name: string }[]> = {
  169: [
    { key: "series-x", name: "Xbox Series X" },
    { key: "series-s", name: "Xbox Series S" },
  ],
};

export function variantOf(platformId: number, key: string | null | undefined) {
  return key ? CONSOLE_VARIANTS[platformId]?.find((v) => v.key === key) ?? null : null;
}

type Photo = {
  file: string;
  width: number;
  height: number;
  artist: string;
  license: string;
  licenseUrl: string | null;
  source: string;
};

const PHOTOS = photos as Record<string, Photo>;

export function consoleArt(
  platformId: number,
  logoImageId: string | null | undefined,
  variant?: string | null
): ConsoleArt | null {
  const key = variantOf(platformId, variant) ? `${platformId}-${variant}` : String(platformId);
  const photo = PHOTOS[key] ?? PHOTOS[String(platformId)];
  const photoKey = PHOTOS[key] ? key : String(platformId);
  if (photo) return { kind: "photo", key: photoKey, src: `/consoles/${photoKey}.webp`, width: photo.width, height: photo.height };
  if (logoImageId && /^[a-z0-9]+$/.test(logoImageId)) {
    return { kind: "logo", key: String(platformId), src: `https://images.igdb.com/igdb/image/upload/t_logo_med/${logoImageId}.png`, width: 284, height: 160 };
  }
  return null;
}

// Every photo, for the credits page; `variantName` for a separately listed model.
export function consolePhotoCredits(): (Photo & { platformId: number; variantName: string | null })[] {
  return Object.entries(PHOTOS).map(([key, p]) => {
    const [id, ...rest] = key.split("-");
    return { ...p, platformId: Number(id), variantName: variantOf(Number(id), rest.join("-"))?.name ?? null };
  });
}
