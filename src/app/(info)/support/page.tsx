import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata = {
  title: "Help & support — Beaten",
  description: "Fix common account problems yourself, or get in touch.",
};

const SELF_SERVICE: { problem: string; fix: React.ReactNode }[] = [
  {
    problem: "Forgot your password",
    fix: (
      <>
        <Link href="/forgot-password" className="text-mint hover:underline">
          Reset it here
        </Link>{" "}
        — we&apos;ll email you a link that works for 30 minutes.
      </>
    ),
  },
  {
    problem: "Never got the confirmation email",
    fix: (
      <>
        Check your spam folder, then{" "}
        <Link href="/login" className="text-mint hover:underline">
          sign in
        </Link>{" "}
        — you&apos;ll be offered a button to send a fresh link.
      </>
    ),
  },
  {
    problem: "Signed up with Google",
    fix: <>Use &ldquo;Continue with Google&rdquo; on the sign-in page. There&apos;s no password to reset.</>,
  },
  {
    problem: "Signed in somewhere you shouldn't be",
    fix: (
      <>
        Settings → Sessions → <em>Sign out everywhere</em>, or change your
        password (which does the same).
      </>
    ),
  },
  {
    problem: "Want a copy of your data",
    fix: <>Settings → Your data. Download everything as JSON, or your diary as a spreadsheet (CSV).</>,
  },
  {
    problem: "Want to leave",
    fix: <>Settings → Delete account. It&apos;s immediate and permanent, so download your data first.</>,
  },
];

export default function SupportPage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">Help &amp; support</h1>
        <p className="mt-2 text-fog">Most account problems you can fix yourself in a minute.</p>
      </header>

      <aside
        role="note"
        className="rounded-xl border border-gold/40 bg-gold/10 p-4 text-[#f3e3c3]"
      >
        <p className="font-semibold text-gold">Please bear with us</p>
        <p className="mt-1">
          Beaten is a free site, and as such we will endeavour to get back to you
          as soon as we can, but there may be a delay.
        </p>
      </aside>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Sort it yourself</h2>
        <dl className="divide-y divide-edge rounded-xl border border-edge bg-card">
          {SELF_SERVICE.map(({ problem, fix }) => (
            <div key={problem} className="grid gap-1 p-4 sm:grid-cols-[14rem_1fr] sm:gap-4">
              <dt className="font-medium text-white">{problem}</dt>
              <dd className="text-fog">{fix}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Still stuck? Email us</h2>
        <p>
          Write to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-mint hover:underline">
            {SUPPORT_EMAIL}
          </a>{" "}
          <strong className="text-white">from the email address on your Beaten account</strong>,
          and include your username and what&apos;s gone wrong.
        </p>
        <p className="text-fog">
          To keep accounts safe, we only make changes for requests that come from
          the account&apos;s own email address. We will never ask for your
          password — don&apos;t send it to anyone, including us.
        </p>
        <p className="text-fog">
          Lost access to that email address too? Tell us what you can (your
          username, roughly when you joined, a few games you&apos;ve logged). We
          can&apos;t always help in that case, because we can&apos;t risk handing
          your account to someone else.
        </p>
      </section>

      <p className="text-fog">
        How we handle your data:{" "}
        <Link href="/privacy" className="text-mint hover:underline">
          Privacy
        </Link>
        .
      </p>
    </article>
  );
}
