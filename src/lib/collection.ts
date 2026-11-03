import type { CollectionItem, Game } from "@prisma/client";
import { prisma } from "./db";
import { parsePartialDate } from "./dates";
import { toPartialInput } from "./format";
import { ensureGame } from "./games";
import { isIgdbId } from "./limits";
import { getPlatforms } from "./platforms";
import {
  MAX_COLLECTION,
  MAX_COLLECTION_NOTES,
  MAX_EDITION,
  isCompleteness,
  isCurrency,
  isRegion,
  parsePrice,
  type CollectionEntry,
} from "./collection-shared";

// Physical collection reads and writes for a known user, shared by the server
// actions and /api/v1 (docs/collection.md). Never touches the diary.

export type CollectionInput = {
  igdbId?: number; // new items only
  platformId: number;
  region?: string | null;
  completeness?: string | null;
  edition?: string | null;
  acquiredAt?: string | null; // YYYY-MM-DD / YYYY-MM / YYYY
  pricePaid?: string | number | null; // "12.50" as typed, or minor units from the app
  currency?: string | null;
  notes?: string | null;
};

export type CollectionSettings = { enabled: boolean; public: boolean };

type Result = { ok: true; item: CollectionEntry } | { ok: false; error: string; notFound?: boolean };

type ItemWithGame = CollectionItem & { game: Game };

function toEntry(row: ItemWithGame, platformName: Map<number, string>, owner: boolean): CollectionEntry {
  let platformIds: number[] = [];
  try {
    platformIds = JSON.parse(row.game.platformIds);
  } catch {}
  return {
    id: row.id,
    igdbId: row.game.igdbId,
    name: row.game.name,
    coverUrl: row.game.coverUrl,
    releaseYear: row.game.releaseYear,
    platformIds,
    platformId: row.platformId,
    platformName: platformName.get(row.platformId) ?? "Unknown platform",
    region: row.region,
    completeness: row.completeness,
    edition: row.edition,
    acquiredAt: owner && row.acquiredAt ? toPartialInput(row.acquiredAt, row.acquiredPrecision) : null,
    pricePaid: owner ? row.pricePaid : null,
    currency: owner ? row.currency : null,
    notes: owner ? row.notes : null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function platformNames() {
  return new Map((await getPlatforms()).map((p) => [p.id, p.name]));
}

export async function collectionSettings(userId: string): Promise<CollectionSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { collectionEnabled: true, collectionPublic: true },
  });
  return { enabled: Boolean(user?.collectionEnabled), public: Boolean(user?.collectionPublic) };
}

// Turning the collection off hides it everywhere (and from the profile) but
// keeps the items, so turning it back on brings them back.
export async function setCollectionSettings(
  userId: string,
  input: { enabled?: unknown; public?: unknown }
): Promise<CollectionSettings | { error: string }> {
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") return { error: "Invalid setting" };
  if (input.public !== undefined && typeof input.public !== "boolean") return { error: "Invalid setting" };
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.enabled !== undefined && { collectionEnabled: input.enabled }),
      ...(input.public !== undefined && { collectionPublic: input.public }),
    },
    select: { collectionEnabled: true, collectionPublic: true },
  });
  return { enabled: user.collectionEnabled, public: user.collectionPublic };
}

// Everything they own, with private fields (prices, notes, dates).
export async function collectionFor(userId: string, where: { gameId?: string } = {}): Promise<CollectionEntry[]> {
  const [rows, names] = await Promise.all([
    prisma.collectionItem.findMany({ where: { userId, ...where }, include: { game: true }, orderBy: { createdAt: "asc" } }),
    platformNames(),
  ]);
  return rows.map((r) => toEntry(r, names, true));
}

// Someone's collection as others see it: only when they've chosen to show
// it, and without prices, notes or dates. Null when it isn't shown.
export async function publicCollection(userId: string): Promise<CollectionEntry[] | null> {
  const settings = await collectionSettings(userId);
  if (!settings.enabled || !settings.public) return null;
  const [rows, names] = await Promise.all([
    prisma.collectionItem.findMany({ where: { userId }, include: { game: true } }),
    platformNames(),
  ]);
  return rows.map((r) => toEntry(r, names, false));
}

export async function collectionJson(userId: string) {
  const [settings, items] = await Promise.all([collectionSettings(userId), collectionFor(userId)]);
  return { ...settings, items };
}

type Fields = Omit<CollectionItem, "id" | "userId" | "gameId" | "source" | "createdAt" | "updatedAt" | "itemCondition" | "boxCondition" | "manualCondition">;

async function validate(input: CollectionInput): Promise<Fields | string> {
  if (!input || typeof input !== "object") return "Invalid request";
  if (!isIgdbId(input.platformId)) return "Choose a platform";
  if (!(await prisma.platform.findUnique({ where: { id: input.platformId }, select: { id: true } }))) {
    return "Unknown platform";
  }
  if (input.region != null && input.region !== "" && !isRegion(input.region)) return "Invalid region";
  if (input.completeness != null && input.completeness !== "" && !isCompleteness(input.completeness)) {
    return "Invalid completeness";
  }
  if (input.edition != null && typeof input.edition !== "string") return "Invalid edition";
  const edition = input.edition?.trim() || null;
  if (edition && edition.length > MAX_EDITION) return `Edition must be ${MAX_EDITION} characters or fewer`;
  if (input.notes != null && typeof input.notes !== "string") return "Invalid notes";
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > MAX_COLLECTION_NOTES) return `Notes must be ${MAX_COLLECTION_NOTES} characters or fewer`;
  const acquired = input.acquiredAt ? parsePartialDate(input.acquiredAt) : null;
  if (input.acquiredAt && !acquired) return "Invalid date";
  if (acquired && acquired.date > new Date()) return "That date is in the future";
  const currency = input.currency || "GBP";
  if (!isCurrency(currency)) return "Invalid currency";
  let pricePaid: number | null = null;
  if (typeof input.pricePaid === "number") {
    if (!Number.isInteger(input.pricePaid) || input.pricePaid < 0 || input.pricePaid > 1e9) return "Invalid price";
    pricePaid = input.pricePaid;
  } else if (input.pricePaid != null) {
    if (typeof input.pricePaid !== "string") return "Invalid price";
    pricePaid = parsePrice(input.pricePaid, currency);
    if (Number.isNaN(pricePaid)) return "Enter the price as a number, like 12.50";
  }
  return {
    platformId: input.platformId,
    region: input.region || null,
    completeness: input.completeness || null,
    edition,
    acquiredAt: acquired?.date ?? null,
    acquiredPrecision: acquired && acquired.precision !== "DAY" ? acquired.precision : null,
    pricePaid,
    currency: pricePaid != null ? currency : null,
    notes,
  };
}

// Adding the first item turns the collection on (still private).
export async function addCollectionItemForUser(userId: string, input: CollectionInput): Promise<Result> {
  if (!isIgdbId(input?.igdbId)) return { ok: false, error: "Invalid game" };
  const fields = await validate(input);
  if (typeof fields === "string") return { ok: false, error: fields };
  if ((await prisma.collectionItem.count({ where: { userId } })) >= MAX_COLLECTION) {
    return { ok: false, error: `Collections are limited to ${MAX_COLLECTION} items` };
  }
  const game = await ensureGame(input.igdbId!);
  const row = await prisma.collectionItem.create({ data: { ...fields, userId, gameId: game.id }, include: { game: true } });
  await prisma.user.update({ where: { id: userId }, data: { collectionEnabled: true } });
  return { ok: true, item: toEntry(row, await platformNames(), true) };
}

export async function updateCollectionItemForUser(userId: string, id: string, input: CollectionInput): Promise<Result> {
  const existing = typeof id === "string" ? await prisma.collectionItem.findUnique({ where: { id } }) : null;
  if (!existing || existing.userId !== userId) return { ok: false, error: "Not in your collection", notFound: true };
  const fields = await validate(input);
  if (typeof fields === "string") return { ok: false, error: fields };
  const row = await prisma.collectionItem.update({ where: { id }, data: fields, include: { game: true } });
  return { ok: true, item: toEntry(row, await platformNames(), true) };
}

export async function deleteCollectionItemForUser(userId: string, id: string): Promise<string | null> {
  const { count } = await prisma.collectionItem.deleteMany({ where: { id, userId } });
  return count ? null : "Not in your collection";
}

// The copies of one game, for its page (owner only).
export async function collectionForGame(userId: string, igdbId: number): Promise<CollectionEntry[]> {
  const game = await prisma.game.findUnique({ where: { igdbId }, select: { id: true } });
  return game ? collectionFor(userId, { gameId: game.id }) : [];
}
