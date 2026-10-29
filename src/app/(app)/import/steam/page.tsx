import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatPartialDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { PLAY_STATUSES, STATUS_RANK, type PlayStatus } from "@/lib/status";
import { steamCapsuleUrl, steamStoreUrl } from "@/lib/steam";
import { MIN_MINUTES, formatPlaytime, importDates, type ImportDates, isComplete, proposeStatus } from "@/lib/steam-import";
import { SteamReviewList, type SteamReviewRow } from "@/components/SteamReviewList";

export const metadata = { title: "Import from Steam — Beaten" };

// What an import at each status would write, e.g. "finished Aug 2022".
function describe(d: ImportDates): string {
  if (d.finishedAt) return `finished ${formatPartialDate(d.finishedAt, d.finishedPrecision ?? null)}`;
  if (d.stoppedAt) return `put down ${formatPartialDate(d.stoppedAt, null)}`;
  if (d.startedAt) return `started ${formatPartialDate(d.startedAt, null)}`;
  return "no date";
}

export default async function SteamImportPage() {
  const user = await requireUser();
  const [account, games, skipped, toMatch] = await Promise.all([
    prisma.steamAccount.findUnique({ where: { userId: user.id } }),
    prisma.steamGame.findMany({
      where: { userId: user.id, state: "PENDING", matchCheckedAt: { not: null } },
      orderBy: { playtimeMinutes: "desc" },
    }),
    prisma.steamGame.count({ where: { userId: user.id, state: "SKIPPED" } }),
    prisma.steamGame.count({ where: { userId: user.id, state: "PENDING", matchCheckedAt: null } }),
  ]);

  const rows: SteamReviewRow[] = games.map((g) => ({
    id: g.id,
    name: g.name,
    capsuleUrl: steamCapsuleUrl(g.appId),
    storeUrl: steamStoreUrl(g.appId),
    playtime: formatPlaytime(g.playtimeMinutes),
    lastPlayed: g.lastPlayedAt ? formatPartialDate(g.lastPlayedAt, null) : null,
    achievements: g.achTotal ? `${g.achUnlocked ?? 0}/${g.achTotal}` : null,
    complete: isComplete(g),
    minor: g.playtimeMinutes < MIN_MINUTES && !isComplete(g),
    proposed: proposeStatus(g),
    when: Object.fromEntries(PLAY_STATUSES.map((s) => [s, describe(importDates(g, s))])) as Record<PlayStatus, string>,
    match: g.igdbId ? { igdbId: g.igdbId, name: g.matchName ?? g.name, coverUrl: g.matchCoverUrl, year: g.matchYear } : null,
  }));
  // Mastered first, then what's being played, then the rest by playtime.
  const order: Record<string, number> = { MASTERED: 0, PLAYING: 1, SHELVED: 2, BEATEN: 2 };
  rows.sort((a, b) => order[a.proposed] - order[b.proposed]);

  const igdbIds = [...new Set(rows.flatMap((r) => (r.match ? [r.match.igdbId] : [])))];
  const logs = igdbIds.length
    ? await prisma.playLog.findMany({
        where: { userId: user.id, game: { igdbId: { in: igdbIds } } },
        select: { status: true, game: { select: { igdbId: true } } },
      })
    : [];
  const diary: Record<number, string> = {};
  for (const l of logs) {
    const prev = diary[l.game.igdbId];
    if (!prev || STATUS_RANK[l.status] > STATUS_RANK[prev]) diary[l.game.igdbId] = l.status;
  }

  return (
    <div className="max-w-3xl">
      <Link href="/settings#steam" className="text-sm text-fog hover:text-white">
        ← Settings
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Import from Steam</h1>
      {!account ? (
        <p className="mt-2 text-sm text-fog">
          <Link href="/settings#steam" className="text-mint hover:underline">
            Sign in through Steam
          </Link>{" "}
          first.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-fog">
            Steam doesn&apos;t know when you&apos;ve beaten something, so each game
            has a suggested status: <span className="text-white">Mastered</span> when
            you&apos;ve every achievement, <span className="text-white">Playing</span> if
            you&apos;ve played it this month, otherwise <span className="text-white">Shelved</span>.
            Change any to <span className="text-white">Beaten</span> (or anything else)
            before importing. Games already in your diary are upgraded or linked,
            never duplicated.
          </p>
          {toMatch > 0 && (
            <p className="mt-3 rounded-md bg-gold/10 px-3 py-2 text-sm text-gold">
              {toMatch} more game{toMatch === 1 ? " is" : "s are"} still being matched — sync again from
              Settings in a minute.
            </p>
          )}
          <div className="mt-6">
            <SteamReviewList rows={rows} diary={diary} skipped={skipped} />
          </div>
        </>
      )}
    </div>
  );
}
