import { prisma } from "@/lib/db";
import { apiError, apiJson, apiRoute, requireApiUser } from "@/lib/api";
import { gameJson, logJson } from "@/lib/api-json";
import { getGame, igdbConfigured } from "@/lib/igdb";
import { isIgdbId } from "@/lib/limits";
import { isPulled } from "@/lib/pull-list";
import { collectionForGame } from "@/lib/collection";
import { reviewSocialFor } from "@/lib/review-social";

type Params = { params: Promise<{ igdbId: string }> };

// GET /api/v1/games/:igdbId → {game, logs, shelfIds, social, pulled}: the
// game, the user's entries for it, the shelves it's on, reactions and comment
// counts on their reviews of it (by log id), and whether it's on their Pull
// List, plus their physical copies of it (collection).
export const GET = apiRoute("api game", async (request: Request, { params }: Params) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const igdbId = Number((await params).igdbId);
  if (!isIgdbId(igdbId)) return apiError("Game not found", 404);

  // Logged games are cached locally; only unseen ones need IGDB.
  const cached = await prisma.game.findUnique({ where: { igdbId } });
  const game = cached ?? (igdbConfigured() ? await getGame(igdbId).catch(() => null) : null);
  if (!game) return apiError("Game not found", 404);

  const [logs, shelfItems, pulled, collection] = await Promise.all([
    prisma.playLog.findMany({
      where: { userId: auth.userId, game: { igdbId } },
      orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.shelfItem.findMany({
      where: { shelf: { userId: auth.userId }, game: { igdbId } },
      select: { shelfId: true },
    }),
    cached ? isPulled(auth.userId, cached.id) : false,
    cached ? collectionForGame(auth.userId, igdbId) : [],
  ]);
  const social = await reviewSocialFor(auth.userId, logs.filter((l) => l.reviewText).map((l) => l.id));
  return apiJson({
    game: gameJson(game),
    logs: logs.map((l) => logJson(l)),
    shelfIds: shelfItems.map((s) => s.shelfId),
    social: Object.fromEntries(social),
    pulled,
    collection,
  });
});
