import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { consoleOptions, loadChronicle } from "@/lib/chronicle";
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

  // Diary games to suggest as favourites: those logged on each console,
  // best-rated first.
  const byPlatform: Record<number, SuggestedGame[]> = {};
  for (const l of logs) {
    if (l.platformId == null) continue;
    const list = (byPlatform[l.platformId] ??= []);
    if (list.length < 12 && !list.some((g) => g.igdbId === l.game.igdbId)) list.push(l.game);
  }

  return (
    <ChronicleEditor
      view={view}
      consoles={consoles}
      suggestions={{ byPlatform }}
    />
  );
}
