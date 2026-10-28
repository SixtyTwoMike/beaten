import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata = {
  title: "Privacy — Beaten",
  description: "What Beaten stores, what's public, and how to get or delete your data.",
};

const LAST_UPDATED = "28 October 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

const list = "list-disc space-y-1.5 pl-5 marker:text-fog";

export default function PrivacyPage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">Privacy</h1>
        <p className="mt-2 text-fog">Last updated {LAST_UPDATED}</p>
      </header>

      <p>
        Beaten is a free, independently run site for logging the games you play.
        The short version: we keep what you put in, show only what&apos;s meant to
        be public, use no ads or trackers, never sell anything, and you can take
        your data or delete it whenever you like.
      </p>

      <Section title="What we store">
        <ul className={list}>
          <li>
            <strong className="text-white">Account:</strong> your email address,
            display name, username, and when you joined. If you use a password,
            we store only a salted bcrypt hash of it, never the password itself.
            If you sign in with Google, we get your name, email and profile picture
            from Google.
          </li>
          <li>
            <strong className="text-white">What you log:</strong> games, platforms,
            dates, ratings, reviews and shelves.
          </li>
          <li>
            <strong className="text-white">Security records:</strong> one-time
            links we email you (stored only as hashes, and they expire), and a
            counter that lets us sign you out everywhere.
          </li>
        </ul>
      </Section>

      <Section title="What's public">
        <p>
          Once you choose a username, your profile at{" "}
          <span className="text-white">beaten.games/your-username</span> shows your display
          name, username, profile picture, join date, the games you&apos;ve logged
          with their ratings and reviews, and your shelves. Anyone can see it
          without signing in. Your email address is never shown.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          Only what signing in needs: a session cookie that keeps you signed in
          (for up to 14 days), plus short-lived security cookies used during
          sign-in. No analytics, advertising or tracking cookies.
        </p>
      </Section>

      <Section title="Who else is involved">
        <ul className={list}>
          <li>
            <strong className="text-white">Amazon Web Services</strong> hosts the
            site and its database, in London (UK).
          </li>
          <li>
            <strong className="text-white">Resend</strong> delivers our emails
            (confirmations, password resets, account notices), so it sees your
            email address and the message.
          </li>
          <li>
            <strong className="text-white">IGDB</strong> (owned by Twitch)
            provides game details and artwork. Searches go from our server to
            IGDB and aren&apos;t linked to you.
          </li>
          <li>
            <strong className="text-white">Have I Been Pwned</strong> lets us
            warn you off passwords that have appeared in data breaches. Only the
            first five characters of a hash of the password are sent, so neither
            the password nor its full hash ever leaves our server.
          </li>
          <li>
            <strong className="text-white">Google</strong>, only if you choose
            &ldquo;Continue with Google&rdquo;.
          </li>
        </ul>
      </Section>

      <Section title="How long we keep it">
        <p>
          Everything is kept while you have an account. When you delete your
          account, your profile, logs, reviews and shelves are removed from our
          database straight away. Our web server&apos;s logs record IP addresses
          and the pages requested, for security and troubleshooting, and are
          deleted after about two weeks.
        </p>
      </Section>

      <Section title="Your choices">
        <ul className={list}>
          <li>
            <strong className="text-white">Download your data</strong> any time
            from Settings → Your data (JSON, or your diary as CSV).
          </li>
          <li>
            <strong className="text-white">Delete your account</strong> from
            Settings → Delete account.
          </li>
          <li>
            <strong className="text-white">Anything else</strong> (corrections,
            questions, a copy of your data if you can&apos;t sign in): email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-mint hover:underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            from your account&apos;s address. See{" "}
            <Link href="/support" className="text-mint hover:underline">
              Help &amp; support
            </Link>
            .
          </li>
        </ul>
        <p className="text-fog">
          If you&apos;re in the UK or EU, data protection law gives you rights to
          access, correct, delete and take a copy of your data. The tools above
          cover most of them, and we&apos;ll handle anything else by email.
        </p>
      </Section>

      <p className="text-fog">
        If this page changes in a way that matters, we&apos;ll update the date
        above.
      </p>
    </article>
  );
}
