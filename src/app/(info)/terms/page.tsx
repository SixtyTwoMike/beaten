import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata = {
  title: "Terms — Beaten",
  description: "The rules for using Beaten, in plain English.",
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

export default function TermsPage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">Terms of use</h1>
        <p className="mt-2 text-fog">Last updated {LAST_UPDATED}</p>
      </header>

      <p>
        Beaten is a free, independently run site for logging the games you play.
        By creating an account or using the site, you agree to these terms. Our{" "}
        <Link href="/privacy" className="text-mint hover:underline">
          privacy policy
        </Link>{" "}
        explains what we do with your data.
      </p>

      <Section title="Your account">
        <ul className={list}>
          <li>You need to be at least 13 to use Beaten.</li>
          <li>
            Keep your sign-in details to yourself. You&apos;re responsible for what
            happens on your account.
          </li>
          <li>
            One person per account. Don&apos;t create accounts automatically or
            in bulk.
          </li>
          <li>
            Usernames must follow our rules: no offensive names, and no
            pretending to be someone you&apos;re not. We may hold back names for
            well-known people and brands, and we may rename an account whose
            name breaks the rules.
          </li>
        </ul>
      </Section>

      <Section title="What you post">
        <ul className={list}>
          <li>
            Your diary, ratings, reviews, shelves and chronicles are yours. You
            give us permission to store them and show them on the site (and in
            share images you create) for as long as they&apos;re on your account.
          </li>
          <li>
            Don&apos;t post anything illegal, hateful, harassing, sexually
            explicit, or that infringes someone else&apos;s rights, and
            don&apos;t spam. Mark reviews with plot details as spoilers.
          </li>
          <li>
            We may remove content or suspend or close accounts that break these
            rules. Report anything you see to{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-mint hover:underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </li>
        </ul>
      </Section>

      <Section title="Using the site fairly">
        <p>
          Don&apos;t try to break, overload or get around the site&apos;s
          security, scrape it in bulk, or access other people&apos;s accounts.
        </p>
      </Section>

      <Section title="Linked accounts and other services">
        <p>
          If you sign in with Google or Apple, or link Steam or
          RetroAchievements, their own terms apply to your use of them. Beaten
          isn&apos;t affiliated with or endorsed by any of them, or by the
          makers of the games listed. Game details and artwork come from IGDB
          and belong to their owners.
        </p>
      </Section>

      <Section title="The service">
        <ul className={list}>
          <li>
            Beaten is provided free and as it is. We do our best to keep it
            running and your data safe, but we can&apos;t promise it will
            always be available or free of mistakes. Keep your own copy of
            anything important: you can download all your data from Settings at
            any time.
          </li>
          <li>
            We may change or stop features. If we ever close the site,
            we&apos;ll give notice where we can so you can download your data.
          </li>
          <li>
            As far as the law allows, we aren&apos;t liable for indirect losses
            or for losing data. Nothing in these terms limits liability that
            can&apos;t legally be limited, or your rights as a consumer.
          </li>
        </ul>
      </Section>

      <Section title="Leaving">
        <p>
          You can delete your account at any time from Settings → Delete
          account. That removes your profile and everything you&apos;ve logged.
        </p>
      </Section>

      <Section title="Changes and the law">
        <p>
          We may update these terms; if a change matters, we&apos;ll update the
          date above and, for big changes, tell you on the site or by email.
          These terms are governed by the law of England and Wales, and you can
          also use the courts where you live. Questions:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-mint hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </article>
  );
}
