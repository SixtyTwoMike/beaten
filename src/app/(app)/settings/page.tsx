import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { SignOutEverywhereButton } from "@/components/SignOutEverywhereButton";
import { UsernameForm } from "@/components/UsernameForm";

export const metadata = { title: "Settings — Beaten" };

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { username: true },
  });

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="mt-6 rounded-xl border border-edge bg-card p-5">
        <h2 className="font-semibold">Public profile</h2>
        <p className="mt-1 text-sm text-fog">
          Anyone with the link can see your profile — your games, ratings,
          reviews, and shelves. Your email is never shown.
        </p>
        <div className="mt-4">
          <UsernameForm current={profile?.username ?? null} />
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-edge bg-card p-5">
        <h2 className="font-semibold">Sessions</h2>
        <p className="mt-1 text-sm text-fog">
          Signed in somewhere you don&apos;t recognise? Sign out on every device,
          including this one.
        </p>
        <div className="mt-4">
          <SignOutEverywhereButton />
        </div>
      </section>
    </div>
  );
}
