import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { SignOutEverywhereButton } from "@/components/SignOutEverywhereButton";
import { UsernameForm } from "@/components/UsernameForm";

export const metadata = { title: "Settings — Beaten" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-edge bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { username: true, passwordHash: true },
  });

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Section title="Public profile">
        <p className="mt-1 text-sm text-fog">
          Anyone with the link can see your profile — your games, ratings,
          reviews, and shelves. Your email is never shown.
        </p>
        <div className="mt-4">
          <UsernameForm current={profile?.username ?? null} />
        </div>
      </Section>

      <Section title="Password">
        {profile?.passwordHash ? (
          <div className="mt-4">
            <ChangePasswordForm />
          </div>
        ) : (
          <p className="mt-1 text-sm text-fog">
            You sign in with Google, so there&apos;s no password to change here.
          </p>
        )}
      </Section>

      <Section title="Sessions">
        <p className="mt-1 text-sm text-fog">
          Signed in somewhere you don&apos;t recognise? Sign out on every device,
          including this one.
        </p>
        <div className="mt-4">
          <SignOutEverywhereButton />
        </div>
      </Section>
    </div>
  );
}
