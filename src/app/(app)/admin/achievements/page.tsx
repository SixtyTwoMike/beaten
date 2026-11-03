import Link from "next/link";
import { adminConfirmAchievement, adminDeleteAchievement, adminUnconfirmAchievement } from "@/app/actions/admin";
import { looksLikeBeatenAchievement } from "@/lib/beaten-achievements";
import { requireAdminPage } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getGameSchemaAchievements, steamConfigured, steamStoreUrl } from "@/lib/steam";

// Set which achievement(s) mean a game is Beaten, for everyone. Find a game
// by name (from players' Steam libraries) or Steam app id, then confirm its
// story-completion achievement; or work through players' suggestions.

type Row = { provider: string; externalGameId: string; achievementKey: string; title: string; description: string | null; voteCount: number };

async function gameNames(appIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(appIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return new Map();
  const rows = await prisma.steamGame.findMany({ where: { appId: { in: ids } }, select: { appId: true, name: true }, distinct: ["appId"] });
  return new Map(rows.map((r) => [String(r.appId), r.name]));
}

function Hidden({ r }: { r: Pick<Row, "provider" | "externalGameId" | "achievementKey"> }) {
  return (
    <>
      <input type="hidden" name="provider" value={r.provider} />
      <input type="hidden" name="gameId" value={r.externalGameId} />
      <input type="hidden" name="key" value={r.achievementKey} />
    </>
  );
}

const btn = "rounded-md px-2.5 py-1 text-xs font-medium transition";
const primary = `${btn} bg-mint text-canvas hover:brightness-110`;
const quiet = `${btn} border border-edge text-fog hover:border-fog/50 hover:text-white`;

export default async function AdminAchievements({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; app?: string }>;
}) {
  await requireAdminPage(); // as well as the layout; see admin/page.tsx
  const { q: rawQ, app: rawApp } = await searchParams;
  const q = (rawQ ?? "").trim().slice(0, 100);
  const appId = Number(rawApp ?? (/^\d+$/.test(q) ? q : NaN));
  const selected = Number.isInteger(appId) && appId > 0 ? appId : null;

  const [suggestions, confirmed, matches] = await Promise.all([
    prisma.beatenAchievement.findMany({
      where: { confirmed: false, voteCount: { gt: 0 } },
      orderBy: [{ voteCount: "desc" }, { updatedAt: "desc" }],
      take: 100,
    }),
    prisma.beatenAchievement.findMany({ where: { confirmed: true }, orderBy: [{ externalGameId: "asc" }, { title: "asc" }] }),
    q && !selected
      ? prisma.steamGame.findMany({
          where: { name: { contains: q } },
          select: { appId: true, name: true },
          distinct: ["appId"],
          orderBy: { name: "asc" },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  const [schema, selectedMappings] = selected
    ? await Promise.all([
        getGameSchemaAchievements(selected),
        prisma.beatenAchievement.findMany({ where: { provider: "STEAM", externalGameId: String(selected) } }),
      ])
    : [[], []];
  const names = await gameNames([
    ...suggestions.map((s) => s.externalGameId),
    ...confirmed.map((c) => c.externalGameId),
    ...(selected ? [String(selected)] : []),
  ]);
  const gameLabel = (id: string) => names.get(id) ?? `Steam app ${id}`;
  const mapped = new Map(selectedMappings.map((m) => [m.achievementKey, m]));
  // Likely story completions first, then the game's own order.
  const ordered = [...schema].sort(
    (a, b) => Number(looksLikeBeatenAchievement(b.title, b.description)) - Number(looksLikeBeatenAchievement(a.title, a.description))
  );

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white">Beaten achievements</h1>
        <p className="mt-1 max-w-2xl text-sm text-fog">
          A confirmed achievement counts as <span className="text-white">Beaten</span> for every player who has
          unlocked it, dated the day they did: their Steam import suggests Beaten, and games already imported come back
          for review as an upgrade. Players&apos; own picks only count for themselves until you confirm them.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-white">Set for a game</h2>
        <form className="mt-2 flex max-w-lg gap-2">
          <input
            name="q"
            defaultValue={selected ? String(selected) : q}
            placeholder="Game name or Steam app id"
            aria-label="Game name or Steam app id"
            className="min-w-0 flex-1 rounded-md border border-edge bg-card px-3 py-1.5 text-sm text-white placeholder:text-fog/60"
          />
          <button className={quiet}>Find</button>
        </form>
        {!steamConfigured() && <p className="mt-2 text-xs text-gold">STEAM_API_KEY isn&apos;t set, so achievement lists can&apos;t load.</p>}
        {q && !selected && (
          <ul className="mt-3 space-y-1 text-sm">
            {matches.length === 0 && (
              <li className="text-fog">No game called that in anyone&apos;s Steam library. Try its Steam app id (the number in its store URL).</li>
            )}
            {matches.map((m) => (
              <li key={m.appId}>
                <Link href={`/admin/achievements?app=${m.appId}`} className="text-white hover:underline">{m.name}</Link>
                <span className="ml-2 text-xs text-fog">{m.appId}</span>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <div className="mt-4 rounded-xl border border-edge bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold text-white">{gameLabel(String(selected))}</h3>
              <a href={steamStoreUrl(selected)} target="_blank" rel="noreferrer" className="text-xs text-fog hover:text-white">
                Steam store ↗
              </a>
            </div>
            {schema.length === 0 ? (
              <p className="mt-2 text-sm text-fog">Steam lists no achievements for app {selected}.</p>
            ) : (
              <ul className="mt-3 max-h-[32rem] space-y-1.5 overflow-y-auto pr-1">
                {ordered.map((a) => {
                  const m = mapped.get(a.key);
                  const r = { provider: "STEAM", externalGameId: String(selected), achievementKey: a.key };
                  return (
                    <li
                      key={a.key}
                      className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${m?.confirmed ? "border-mint/50 bg-mint/5" : "border-edge bg-canvas/60"}`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-white">{a.title}</span>
                          {m?.confirmed && <span className="rounded bg-mint/20 px-1.5 py-0.5 text-[10px] font-medium text-mint">Confirmed</span>}
                          {m && m.voteCount > 0 && (
                            <span className="rounded bg-card-2 px-1.5 py-0.5 text-[10px] text-fog">
                              picked by {m.voteCount} player{m.voteCount === 1 ? "" : "s"}
                            </span>
                          )}
                          {!m?.confirmed && looksLikeBeatenAchievement(a.title, a.description) && (
                            <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] text-gold">Likely story completion</span>
                          )}
                          {a.hidden && <span className="text-[10px] text-fog">hidden</span>}
                        </div>
                        {a.description && <p className="mt-0.5 text-fog">{a.description}</p>}
                      </div>
                      <form action={m?.confirmed ? adminUnconfirmAchievement : adminConfirmAchievement}>
                        <Hidden r={r} />
                        <button className={m?.confirmed ? quiet : primary}>{m?.confirmed ? "Unconfirm" : "Confirm"}</button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-white">Suggestions from players</h2>
        {suggestions.length === 0 ? (
          <p className="mt-2 text-sm text-fog">Nothing waiting.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {suggestions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-edge bg-card px-3 py-2 text-xs">
                <div className="min-w-0">
                  <Link href={`/admin/achievements?app=${s.externalGameId}`} className="text-fog hover:text-white">
                    {gameLabel(s.externalGameId)}
                  </Link>
                  <div className="font-medium text-white">
                    {s.title} <span className="font-normal text-fog">· {s.voteCount} player{s.voteCount === 1 ? "" : "s"}</span>
                  </div>
                  {s.description && <p className="text-fog">{s.description}</p>}
                </div>
                <div className="flex gap-2">
                  <form action={adminConfirmAchievement}>
                    <Hidden r={s} />
                    <button className={primary}>Confirm</button>
                  </form>
                  <form action={adminDeleteAchievement}>
                    <Hidden r={s} />
                    <button className={quiet} title="Removes it, and players' own picks of it">Reject</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-white">Confirmed</h2>
        {confirmed.length === 0 ? (
          <p className="mt-2 text-sm text-fog">None yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {confirmed.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border border-edge bg-card px-3 py-2 text-xs">
                <div className="min-w-0">
                  <Link href={`/admin/achievements?app=${c.externalGameId}`} className="text-fog hover:text-white">
                    {gameLabel(c.externalGameId)}
                  </Link>
                  <div className="font-medium text-white">{c.title}</div>
                </div>
                <form action={adminUnconfirmAchievement}>
                  <Hidden r={c} />
                  <button className={quiet}>Unconfirm</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
