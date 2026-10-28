import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { raGameUrl, raIconUrl } from "@/lib/retroachievements";
import { requireUser } from "@/lib/session";
import { STATUS_RANK } from "@/lib/status";
import { RaReviewList, type RaReviewRow } from "@/components/RaReviewList";

export const metadata = { title: "Import from RetroAchievements — Beaten" };

export default async function RaImportPage() {
  const user = await requireUser();
  const [account, awards, skipped, unmatched] = await Promise.all([
    prisma.raAccount.findUnique({ where: { userId: user.id } }),
    prisma.raAward.findMany({
      where: { userId: user.id, state: "PENDING", matchConfidence: { not: null } },
      orderBy: { awardedAt: "desc" },
    }),
    prisma.raAward.count({ where: { userId: user.id, state: "SKIPPED" } }),
    prisma.raAward.count({ where: { userId: user.id, state: "PENDING", matchConfidence: null } }),
  ]);

  // One row per RA game; a beaten + mastered pair becomes one entry.
  const rows = new Map<number, RaReviewRow>();
  for (const a of awards) {
    const row = rows.get(a.raGameId);
    if (row) {
      row.awardIds.push(a.id);
      if (STATUS_RANK[a.kind] > STATUS_RANK[row.kind]) {
        row.kind = a.kind as RaReviewRow["kind"];
        row.date = formatDate(a.awardedAt);
      }
      row.hardcore ||= a.hardcore;
      continue;
    }
    rows.set(a.raGameId, {
      key: String(a.raGameId),
      awardIds: [a.id],
      title: a.title,
      consoleName: a.consoleName,
      kind: a.kind as RaReviewRow["kind"],
      hardcore: a.hardcore,
      date: formatDate(a.awardedAt),
      iconUrl: raIconUrl(a.iconPath),
      raUrl: raGameUrl(a.raGameId),
      confidence: a.matchConfidence as RaReviewRow["confidence"],
      match: a.igdbId
        ? { igdbId: a.igdbId, name: a.matchName ?? "Unknown game", coverUrl: a.matchCoverUrl, year: a.matchYear }
        : null,
    });
  }

  // What's already in the diary for the proposed games, so rows can say
  // "will upgrade" / "already logged".
  const igdbIds = [...new Set([...rows.values()].flatMap((r) => (r.match ? [r.match.igdbId] : [])))];
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
      <Link href="/settings#retroachievements" className="text-sm text-fog hover:text-white">
        ← Settings
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Import from RetroAchievements</h1>
      {!account ? (
        <p className="mt-2 text-sm text-fog">
          <Link href="/settings#retroachievements" className="text-mint hover:underline">
            Link your RetroAchievements account
          </Link>{" "}
          first.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-fog">
            Beaten and mastered awards from <span className="text-white">{account.raUsername}</span>,
            matched to games here. Confident matches are ticked; check the rest
            (or change the match) before importing. Games already in your
            diary are upgraded or linked, never duplicated.
          </p>
          {unmatched > 0 && (
            <p className="mt-3 rounded-md bg-gold/10 px-3 py-2 text-sm text-gold">
              {unmatched} more award{unmatched === 1 ? " is" : "s are"} still being matched — sync
              again from Settings in a minute.
            </p>
          )}
          <div className="mt-6">
            <RaReviewList rows={[...rows.values()]} diary={diary} skipped={skipped} />
          </div>
        </>
      )}
    </div>
  );
}
