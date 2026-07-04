// Shared shapes passed between server pages and client components.

export type ModalGame = {
  igdbId: number;
  name: string;
  releaseYear: number | null;
  coverUrl: string | null;
  platformIds: number[];
};

export type PlatformOption = {
  id: number;
  name: string;
  abbreviation: string | null;
};

export type ShelfOption = { id: string; name: string };

export type ExistingLog = {
  logId: string;
  status: string;
  platformId: number | null;
  startedAt: string | null; // YYYY-MM-DD
  finishedAt: string | null; // YYYY-MM-DD; null while status is PLAYING
  isReplay: boolean;
  rating: number | null;
  reviewText: string | null;
};
