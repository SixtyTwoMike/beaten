import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { consoleOptions, loadChronicle, STORY_PER_PAGE } from "@/lib/chronicle";
import { ChronicleEditor, type SuggestedGame } from "@/components/ChronicleEditor";

export const metadata = { title: "Console chronicles — Beaten" };

export default async function ChroniclesEditorPage() {
  const user = await requireUser();
  const [profile, logs] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, username: true } }),
    prisma.playLog.findMany({
      where: { userId: user.id },
      orderBy: [{ rating: "desc" }, { updatedAt: "desc" }],
      take: 300,
      select: { platformId: true, game: { select: { igdbId: true, name: true, coverUrl: true } } },
    }),
  ]);
  const [view, consoles] = await Promise.all([loadChronicle(profile!), consoleOptions()]);

  // Diary games to suggest as favourites: those logged on each console, and
  // the best-rated overall for consoles with none.
  const byPlatform: Record<number, SuggestedGame[]> = {};
  const overall: SuggestedGame[] = [];
  const seen = new Set<string>();
  for (const l of logs) {
    if (l.platformId != null) {
      const list = (byPlatform[l.platformId] ??= []);
      if (list.length < 12 && !list.some((g) => g.igdbId === l.game.igdbId)) list.push(l.game);
    }
    const key = String(l.game.igdbId);
    if (overall.length < 12 && !seen.has(key)) {
      seen.add(key);
      overall.push(l.game);
    }
  }

  return (
    <ChronicleEditor
      view={view}
      consoles={consoles}
      suggestions={{ byPlatform, overall }}
      storyPages={Math.max(1, Math.ceil(view.stops.length / STORY_PER_PAGE))}
    />
  );
}
