import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata = {
  title: "Privacy — Beaten",
  description: "What Beaten stores, what's public, and how to get or delete your data.",
};

const LAST_UPDATED = "29 October 2026";

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
            from Google. If you sign in with Apple, we get your email (or a
            private relay address, if you choose to hide yours) and, the first
            time only, your name.
          </li>
          <li>
            <strong className="text-white">What you log:</strong> games, platforms,
            dates, ratings, reviews and shelves.
          </li>
          <li>
            <strong className="text-white">Console chronicles:</strong> the consoles
            you add, when you got them, your notes and favourite games, and, if you
            give it, the year you were born. The birth year is used only to work out
            how old you were for each console and is never shown; you can turn ages
            off or clear it at any time. If you make a chronicle without an
            account, it stays in your browser on that device and isn&apos;t sent
            to us unless you sign up or sign in and bring it across.
          </li>
          <li>
            <strong className="text-white">Linked game accounts:</strong> if you
            link Steam, your Steam ID and display name, and for each game
            you&apos;ve played: its name, your playtime, when you last played it,
            and how many achievements you&apos;ve unlocked and when the first and
            last were. If you link RetroAchievements, your RetroAchievements
            username and the beaten and mastered awards it shows publicly. We
            fetch these only when you sync, nothing goes into your diary until
            you import it, and unlinking deletes them (imported diary entries stay).
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
          with their ratings and reviews, and your shelves. Your console
          chronicle, if you make one, is public too, at{" "}
          <span className="text-white">beaten.games/your-username/chronicles</span>.
          Anyone can see these without signing in. Your email address is never shown.
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
            <strong className="text-white">Valve (Steam)</strong> and{" "}
            <strong className="text-white">RetroAchievements</strong>, only if you
            link those accounts. Signing in through Steam happens on Steam&apos;s
            own site; we never see your Steam password.
          </li>
          <li>
            <strong className="text-white">Google</strong> or{" "}
            <strong className="text-white">Apple</strong>, only if you choose
            &ldquo;Continue with Google&rdquo; or &ldquo;Continue with Apple&rdquo;.
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
