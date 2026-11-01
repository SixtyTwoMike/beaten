import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function AdminHome() {
  const [users, verified, suggestions, confirmed, steamLinked] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
    prisma.beatenAchievement.count({ where: { confirmed: false, voteCount: { gt: 0 } } }),
    prisma.beatenAchievement.count({ where: { confirmed: true } }),
    prisma.steamAccount.count(),
  ]);
  const stats = [
    ["Accounts", users],
    ["Verified", verified],
    ["Steam linked", steamLinked],
    ["Confirmed beaten achievements", confirmed],
  ] as const;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Admin</h1>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, n]) => (
          <div key={label} className="rounded-xl border border-edge bg-card p-4">
            <dt className="text-xs text-fog">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold text-white tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      <Link
        href="/admin/achievements"
        className="block rounded-xl border border-edge bg-card p-4 transition hover:border-fog/50"
      >
        <h2 className="font-semibold text-white">Beaten achievements</h2>
        <p className="mt-1 text-sm text-fog">
          {suggestions > 0
            ? `${suggestions} suggestion${suggestions === 1 ? "" : "s"} from players to review.`
            : "No suggestions waiting."}{" "}
          Set which achievement means a game is beaten.
        </p>
      </Link>
    </div>
  );
}
