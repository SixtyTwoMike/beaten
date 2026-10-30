import { prisma } from "@/lib/db";
import { apiError, apiJson, apiRoute, readJson, requireApiUser } from "@/lib/api";
import { chronicleFor } from "@/lib/api-chronicle";
import { gameJson } from "@/lib/api-json";
import { saveChronicleSettingsForUser, type ChronicleSettingsInput } from "@/lib/chronicle-write";

// GET /api/v1/chronicle → {chronicle, suggestions}. Suggestions are diary
// games per console (best-rated first), as the web editor offers.
export const GET = apiRoute("api chronicle", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const logs = await prisma.playLog.findMany({
    where: { userId: auth.userId, platformId: { not: null } },
    orderBy: [{ rating: "desc" }, { updatedAt: "desc" }],
    take: 300,
    select: { platformId: true, game: true },
  });
  const suggestions: Record<number, ReturnType<typeof gameJson>[]> = {};
  for (const l of logs) {
    const list = (suggestions[l.platformId!] ??= []);
    if (list.length < 12 && !list.some((g) => g.igdbId === l.game.igdbId)) list.push(gameJson(l.game));
  }
  return apiJson({ chronicle: await chronicleFor(auth.userId), suggestions });
});

// PATCH /api/v1/chronicle {title, birthYear, showAges, accent, background, path} → {chronicle}
export const PATCH = apiRoute("api chronicle settings", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const error = await saveChronicleSettingsForUser(auth.userId, body as ChronicleSettingsInput);
  if (error) return apiError(error);
  return apiJson({ chronicle: await chronicleFor(auth.userId) });
});
