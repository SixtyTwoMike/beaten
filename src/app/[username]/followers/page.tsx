import { FollowListPage, pageParam } from "@/components/FollowListPage";

export const metadata = { title: "Followers — Beaten" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ username }, { page }] = await Promise.all([params, searchParams]);
  return <FollowListPage raw={username} kind="followers" page={pageParam(page)} />;
}
