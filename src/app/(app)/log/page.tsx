import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDate, toDateInput } from "@/lib/format";
import { getPlatforms } from "@/lib/platforms";
import { requireUser } from "@/lib/session";
import { LogEntryActions } from "@/components/LogEntryActions";
import { Poster } from "@/components/Poster";
import { Stars } from "@/components/Stars";
import { StatusBadge } from "@/components/StatusBadge";

export const metadata = { title: "Diary — Beaten" };

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; platform?: string; year?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const where: Prisma.PlayLogWhereInput = { userId: user.id };
  if (params.status === "BEATEN" || params.status === "MASTERED") {
    where.status = params.status;
  }
  const platformFilter = params.platform ? Number(params.platform) : null;
  if (platformFilter) where.platformId = platformFilter;
  const yearFilter = params.year ? Number(params.year) : null;
  if (yearFilter) {
    where.finishedAt = {
      gte: new Date(Date.UTC(yearFilter, 0, 1)),
      lt: new Date(Date.UTC(yearFilter + 1, 0, 1)),
    };
  }

  const [logs, allLogsForYears, platforms, shelves] = await Promise.all([
    prisma.playLog.findMany({
      where,
      orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
      include: { game: true },
    }),
    prisma.playLog.findMany({
      where: { userId: user.id },
      select: { finishedAt: true },
    }),
    getPlatforms(),
    prisma.shelf.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const years = [
    ...new Set(allLogsForYears.map((l) => l.finishedAt.getUTCFullYear())),
  ].sort((a, b) => b - a);

  const platformOptions = platforms.map((p) => ({
    id: p.id,
    name: p.name,
    abbreviation: p.abbreviation,
  }));
  const platformById = new Map(platforms.map((p) => [p.id, p]));

  const selectClass =
    "rounded-md border border-edge bg-card px-3 py-2 text-sm outline-none focus:border-mint/60";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Diary</h1>
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <select name="status" defaultValue={params.status ?? ""} className={selectClass}>
            <option value="">Any status</option>
            <option value="BEATEN">Beaten</option>
            <option value="MASTERED">Mastered</option>
          </select>
          <select
            name="platform"
            defaultValue={params.platform ?? ""}
            className={selectClass}
          >
            <option value="">Any platform</option>
            {platformOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select name="year" defaultValue={params.year ?? ""} className={selectClass}>
            <option value="">Any year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-edge px-3 py-2 text-sm text-fog hover:border-fog/50 hover:text-white transition"
          >
            Filter
          </button>
        </form>
      </div>

      {logs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-edge bg-card/50 p-10 text-center">
          <p className="text-fog">
            No log entries{Object.keys(params).length ? " match these filters" : " yet"}.
          </p>
          <Link
            href="/search"
            className="mt-4 inline-block text-sm text-mint hover:underline"
          >
            Search for a game to log →
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {logs.map((log) => {
            const platform = log.platformId
              ? platformById.get(log.platformId)
              : null;
            return (
              <li
                key={log.id}
                className="flex gap-4 rounded-xl border border-edge bg-card p-4"
              >
                <Link
                  href={`/games/${log.game.igdbId}`}
                  className="w-16 shrink-0 sm:w-20"
                >
                  <Poster name={log.game.name} coverUrl={log.game.coverUrl} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link
                      href={`/games/${log.game.igdbId}`}
                      className="font-semibold hover:text-mint"
                    >
                      {log.game.name}
                      {log.game.releaseYear && (
                        <span className="ml-1.5 font-normal text-fog">
                          {log.game.releaseYear}
                        </span>
                      )}
                    </Link>
                    <StatusBadge status={log.status} />
                    {log.isReplay && (
                      <span className="rounded-full bg-card-2 px-2 py-0.5 text-xs text-fog">
                        ↻ Replay
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-fog">
                    {log.startedAt && `${formatDate(log.startedAt)} – `}
                    {formatDate(log.finishedAt)}
                    {platform && (
                      <span className="ml-2 rounded bg-card-2 px-1.5 py-0.5 text-xs">
                        {platform.abbreviation ?? platform.name}
                      </span>
                    )}
                  </p>
                  {log.rating != null && (
                    <div className="mt-1.5">
                      <Stars rating={log.rating} />
                    </div>
                  )}
                  {log.reviewText && (
                    <p className="mt-2 whitespace-pre-line text-sm text-fog/90">
                      {log.reviewText}
                    </p>
                  )}
                </div>
                <div className="shrink-0 self-start">
                  <LogEntryActions
                    game={{
                      igdbId: log.game.igdbId,
                      name: log.game.name,
                      releaseYear: log.game.releaseYear,
                      coverUrl: log.game.coverUrl,
                      platformIds: JSON.parse(log.game.platformIds) as number[],
                    }}
                    existing={{
                      logId: log.id,
                      status: log.status,
                      platformId: log.platformId,
                      startedAt: log.startedAt ? toDateInput(log.startedAt) : null,
                      finishedAt: toDateInput(log.finishedAt),
                      isReplay: log.isReplay,
                      rating: log.rating,
                      reviewText: log.reviewText,
                    }}
                    platforms={platformOptions}
                    shelves={shelves}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
