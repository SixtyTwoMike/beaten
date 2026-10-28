import photos from "./console-images.json";

// The picture for a console in Console Chronicles: a photo of the hardware
// for the popular ones (public/consoles, built by scripts/console-images.mjs
// from Wikimedia Commons; credited on /credits), else its IGDB logo.

export type ConsoleArt = { kind: "photo" | "logo"; src: string; width: number; height: number };

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

export function consoleArt(platformId: number, logoImageId: string | null | undefined): ConsoleArt | null {
  const photo = PHOTOS[String(platformId)];
  if (photo) return { kind: "photo", src: `/consoles/${platformId}.webp`, width: photo.width, height: photo.height };
  if (logoImageId && /^[a-z0-9]+$/.test(logoImageId)) {
    return { kind: "logo", src: `https://images.igdb.com/igdb/image/upload/t_logo_med/${logoImageId}.png`, width: 284, height: 160 };
  }
  return null;
}

// Every photo, for the credits page.
export function consolePhotoCredits(): (Photo & { platformId: number })[] {
  return Object.entries(PHOTOS).map(([id, p]) => ({ ...p, platformId: Number(id) }));
}
