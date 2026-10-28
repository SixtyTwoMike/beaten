import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ShareCardBuilder } from "@/components/ShareCardBuilder";

export const metadata = { title: "Share — Beaten" };

export default async function SharePage() {
  const user = await requireUser();
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { username: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Share</h1>
      <p className="mt-1 max-w-2xl text-sm text-fog">
        Make an image of your last four beaten or played games for Instagram,
        Bluesky or anywhere else. It only shows what&apos;s already on your
        public profile.
      </p>

      <section className="mt-6 rounded-xl border border-edge bg-card p-5">
        {profile?.username ? (
          <ShareCardBuilder username={profile.username} />
        ) : (
          <p className="text-sm text-fog">
            Share cards link to your public profile, so you need a username
            first.{" "}
            <Link href="/settings" className="text-mint hover:underline">
              Pick one in Settings
            </Link>
            .
          </p>
        )}
      </section>

      {profile?.username && (
        <p className="mt-4 text-sm text-fog">
          Your profile:{" "}
          <Link href={`/${profile.username}`} className="text-mint hover:underline">
            beaten.games/{profile.username}
          </Link>{" "}
          — links to it show the link-preview card automatically.
        </p>
      )}
    </div>
  );
}
