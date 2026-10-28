import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { DeleteAccountForm } from "@/components/DeleteAccountForm";
import { SignOutEverywhereButton } from "@/components/SignOutEverywhereButton";
import { UsernameForm } from "@/components/UsernameForm";

export const metadata = { title: "Settings — Beaten" };

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-6 scroll-mt-20 rounded-xl border border-edge bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { username: true, email: true, passwordHash: true },
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

      <Section id="password" title="Password">
        {profile?.passwordHash ? (
          <div className="mt-4">
            <ChangePasswordForm email={profile.email} />
          </div>
        ) : (
          <p className="mt-1 text-sm text-fog">
            You sign in with Google, so there&apos;s no password to change here.
          </p>
        )}
      </Section>

      <Section title="Your data">
        <p className="mt-1 text-sm text-fog">
          Download everything you&apos;ve logged, any time. The JSON file is
          complete (logs, reviews, shelves, profile); the CSV is your diary as
          a spreadsheet.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <a
            href="/api/account/export?format=json"
            className="rounded-md border border-edge px-3 py-1.5 hover:border-fog/50 transition"
          >
            Download all data (JSON)
          </a>
          <a
            href="/api/account/export?format=csv"
            className="rounded-md border border-edge px-3 py-1.5 hover:border-fog/50 transition"
          >
            Download diary (CSV)
          </a>
        </div>
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

      <Section title="Delete account">
        <div className="mt-3">
          <DeleteAccountForm hasPassword={Boolean(profile?.passwordHash)} />
        </div>
      </Section>
    </div>
  );
}
