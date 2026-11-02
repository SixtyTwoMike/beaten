import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { pullListFor } from "@/lib/pull-list";
import { isPullSort } from "@/lib/pull-sort";
import { requireUser } from "@/lib/session";
import { PullList } from "@/components/PullList";

export const metadata: Metadata = { title: "Pull List" };

export default async function PullListPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const user = await requireUser();
  const { sort } = await searchParams;
  const [entries, steam] = await Promise.all([
    pullListFor(user.id),
    prisma.steamAccount.findUnique({ where: { userId: user.id }, select: { id: true } }),
  ]);
  return <PullList entries={entries} steamLinked={Boolean(steam)} initialSort={isPullSort(sort) ? sort : "order"} />;
}
