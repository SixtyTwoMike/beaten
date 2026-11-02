import { prisma } from "./db";
import { backfillGameDetails, ensureGame, ensureGames, gameGenres } from "./games";
import { findBySteamAppIds } from "./igdb";
import { isIgdbId } from "./limits";
import type { PullEntry } from "./pull-sort";
import { getWishlist } from "./steam";

// Pull List reads and writes for a known user, shared by the server actions
// and /api/v1. Games leave the list when they're logged (leavePullList).

export const MAX_PULL = 500;
// Wishlist reads per account: one a minute.
const WISHLIST_COOLDOWN_MS = 60 * 1000;

type Row = {
  source: string;
  addedAt: Date;
  game: { id: string; igdbId: number; name: string; coverUrl: string | null; releaseDate: Date | null; genres: string | null; platformIds: string };
};

function toEntry(r: Row): PullEntry {
  let platformIds: number[] = [];
  try {
    platformIds = JSON.parse(r.game.platformIds);
  } catch {}
  return {
    igdbId: r.game.igdbId,
    name: r.game.name,
    coverUrl: r.game.coverUrl,
    releaseDate: r.game.releaseDate?.toISOString().slice(0, 10) ?? null,
    genres: gameGenres(r.game.genres),
    platformIds,
    source: r.source,
    addedAt: r.addedAt.toISOString(),
  };
}

// The list in the user's order. Games cached before genres were stored are
// filled in from IGDB first (once; later reads find nothing to do).
export async function pullListFor(userId: string): Promise<PullEntry[]> {
  const read = () =>
    prisma.pullItem.findMany({
      where: { userId },
      orderBy: [{ position: "asc" }, { addedAt: "asc" }],
      select: { source: true, addedAt: true, game: true },
    });
  let rows = await read();
  const stale = rows.filter((r) => r.game.genres === null).map((r) => r.game.id);
  if (stale.length && (await backfillGameDetails(stale))) rows = await read();
  return rows.map(toEntry);
}

// For /api/v1: the list, and whether Steam is linked (for its wishlist button).
export async function pullListJson(userId: string) {
  const [items, steam] = await Promise.all([
    pullListFor(userId),
    prisma.steamAccount.findUnique({ where: { userId }, select: { id: true } }),
  ]);
  return { items, steamLinked: Boolean(steam) };
}

export async function pulledIgdbIds(userId: string): Promise<Set<number>> {
  const rows = await prisma.pullItem.findMany({ where: { userId }, select: { game: { select: { igdbId: true } } } });
  return new Set(rows.map((r) => r.game.igdbId));
}

export async function isPulled(userId: string, gameId: string): Promise<boolean> {
  return Boolean(await prisma.pullItem.findUnique({ where: { userId_gameId: { userId, gameId } }, select: { id: true } }));
}

async function nextPosition(userId: string): Promise<number> {
  const last = await prisma.pullItem.aggregate({ where: { userId }, _max: { position: true } });
  return (last._max.position ?? -1) + 1;
}

// Adds a game to the bottom of the list. Returns an error message, or null.
export async function addToPullListForUser(userId: string, igdbId: number): Promise<string | null> {
  if (!isIgdbId(igdbId)) return "Invalid game";
  if ((await prisma.pullItem.count({ where: { userId } })) >= MAX_PULL) {
    return `Your Pull List is full (${MAX_PULL} games)`;
  }
  const game = await ensureGame(igdbId);
  await prisma.pullItem.upsert({
    where: { userId_gameId: { userId, gameId: game.id } },
    update: {},
    create: { userId, gameId: game.id, position: await nextPosition(userId) },
  });
  return null;
}

export async function removeFromPullListForUser(userId: string, igdbId: number): Promise<string | null> {
  if (!isIgdbId(igdbId)) return "Invalid game";
  await prisma.pullItem.deleteMany({ where: { userId, game: { igdbId } } });
  return null;
}

// Games logged in the diary leave the list.
export async function leavePullList(userId: string, gameId: string) {
  await prisma.pullItem.deleteMany({ where: { userId, gameId } });
}

// Saves a new order: every game on the list, by IGDB id, first to last.
export async function reorderPullListForUser(userId: string, igdbIds: unknown): Promise<string | null> {
  if (!Array.isArray(igdbIds) || igdbIds.length > MAX_PULL || !igdbIds.every(isIgdbId)) return "Invalid order";
  const rows = await prisma.pullItem.findMany({ where: { userId }, select: { id: true, game: { select: { igdbId: true } } } });
  const idFor = new Map(rows.map((r) => [r.game.igdbId, r.id]));
  if (new Set(igdbIds).size !== igdbIds.length || igdbIds.length !== rows.length || !igdbIds.every((id) => idFor.has(id))) {
    return "The list changed — reload and try again";
  }
  await prisma.$transaction(igdbIds.map((igdbId, position) => prisma.pullItem.update({ where: { id: idFor.get(igdbId)! }, data: { position } })));
  return null;
}

export type WishlistResult =
  | { ok: true; added: number; unmatched: number; empty: boolean }
  | { ok: false; error: string };

// Adds Steam wishlist games to the bottom of the list, in the wishlist's
// order. After the first read only games wishlisted since the last one are
// added, so games removed from the Pull List stay removed. Games already on
// the list or in the diary are left alone; so are apps IGDB doesn't know.
// force: skip the cooldown (straight after linking Steam).
export async function importSteamWishlistForUser(userId: string, { force = false } = {}): Promise<WishlistResult> {
  const account = await prisma.steamAccount.findUnique({ where: { userId } });
  if (!account) return { ok: false, error: "Sign in through Steam first (Settings)" };
  if (!force && account.wishlistSyncedAt && Date.now() - account.wishlistSyncedAt.getTime() < WISHLIST_COOLDOWN_MS) {
    return { ok: false, error: "Checked a moment ago — try again in a minute" };
  }
  const startedAt = new Date();
  const wishlist = await getWishlist(account.steamId);
  const since = account.wishlistSyncedAt;
  const fresh = since ? wishlist.filter((w) => w.addedAt > since) : wishlist;

  const igdbFor = new Map<number, number>();
  for (let i = 0; i < fresh.length; i += 500) {
    const found = await findBySteamAppIds(fresh.slice(i, i + 500).map((w) => w.appId));
    for (const [appId, g] of found) igdbFor.set(appId, g.igdbId);
  }
  const games = await ensureGames([...igdbFor.values()]);
  const [onList, logged, count] = await Promise.all([
    pulledIgdbIds(userId),
    prisma.playLog.findMany({ where: { userId }, select: { game: { select: { igdbId: true } } } }),
    prisma.pullItem.count({ where: { userId } }),
  ]);
  const skip = new Set([...onList, ...logged.map((l) => l.game.igdbId)]);

  let position = await nextPosition(userId);
  let added = 0;
  for (const w of fresh) {
    const igdbId = igdbFor.get(w.appId);
    const game = igdbId ? games.get(igdbId) : undefined;
    if (!game || skip.has(game.igdbId) || count + added >= MAX_PULL) continue;
    skip.add(game.igdbId); // two app ids (editions) can be one game
    await prisma.pullItem.create({ data: { userId, gameId: game.id, position: position++, source: "STEAM", addedAt: w.addedAt.getTime() > 0 ? w.addedAt : startedAt } });
    added++;
  }
  // An empty wishlist may just be private: keep reading all of it until
  // something comes back.
  if (wishlist.length) await prisma.steamAccount.update({ where: { userId }, data: { wishlistSyncedAt: startedAt } });
  return { ok: true, added, unmatched: fresh.filter((w) => !igdbFor.has(w.appId)).length, empty: wishlist.length === 0 };
}
