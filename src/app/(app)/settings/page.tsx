import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isAvatarSource } from "@/lib/avatar";
import { FINISHED_STATUSES } from "@/lib/status";
import { formatDate } from "@/lib/format";
import { usernameForInvite } from "@/lib/reserved-usernames";
import { nextUsernameChange } from "@/lib/username";
import { raConfigured, raProfileUrl } from "@/lib/retroachievements";
import { RetroAchievementsLink } from "@/components/RetroAchievementsLink";
import { AvatarPicker, type AvatarGame } from "@/components/AvatarPicker";
import { BlockedList } from "@/components/BlockedList";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { DeleteAccountForm } from "@/components/DeleteAccountForm";
import { SignOutEverywhereButton } from "@/components/SignOutEverywhereButton";
import { SocialLinksForm } from "@/components/SocialLinksForm";
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

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite: inviteCode } = await searchParams;
  const user = await requireUser();
  const invitedUsername = await usernameForInvite(inviteCode);
  const blocked = await prisma.block.findMany({
    where: { blockerId: user.id },
    orderBy: { createdAt: "desc" },
    select: { blocked: { select: { username: true, name: true } } },
  });
  const [profile, finishedLogs, raAccount, raPending] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        username: true,
        usernameChangedAt: true,
        name: true,
        email: true,
        passwordHash: true,
        instagram: true,
        bluesky: true,
        avatarGameId: true,
        avatarSource: true,
        avatarX: true,
        avatarY: true,
        avatarZoom: true,
      },
    }),
    // Avatar candidates: finished games with some art, latest finish first.
    prisma.playLog.findMany({
      where: { userId: user.id, status: { in: FINISHED_STATUSES } },
      orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
      select: { game: { select: { id: true, name: true, coverUrl: true, artworkUrl: true } } },
    }),
    prisma.raAccount.findUnique({ where: { userId: user.id } }),
    // Games waiting for review (a beaten + mastered pair is one game).
    prisma.raAward.findMany({
      where: { userId: user.id, state: "PENDING", matchConfidence: { not: null } },
      select: { raGameId: true },
      distinct: ["raGameId"],
    }),
  ]);

  const avatarGames = new Map<string, AvatarGame>();
  for (const { game } of finishedLogs) {
    if (avatarGames.has(game.id) || (!game.coverUrl && !game.artworkUrl)) continue;
    avatarGames.set(game.id, {
      gameId: game.id,
      name: game.name,
      coverUrl: game.coverUrl,
      artworkUrl: game.artworkUrl,
    });
  }
  const currentAvatar =
    profile?.avatarGameId && isAvatarSource(profile.avatarSource)
      ? {
          gameId: profile.avatarGameId,
          source: profile.avatarSource,
          x: profile.avatarX,
          y: profile.avatarY,
          zoom: profile.avatarZoom,
        }
      : null;

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Section title="Public profile">
        <p className="mt-1 text-sm text-fog">
          Anyone with the link can see your profile — your games, ratings,
          reviews, and shelves. Your email is never shown.
        </p>
        <div className="mt-4">
          <UsernameForm
            current={profile?.username ?? null}
            nextChange={profile ? formatDate(nextUsernameChange(profile)) || null : null}
            invite={inviteCode && invitedUsername ? { code: inviteCode, username: invitedUsername } : null}
          />
        </div>
      </Section>

      <Section title="Profile picture">
        <p className="mt-1 text-sm text-fog">
          Use the cover or artwork of any game you&apos;ve finished.
        </p>
        <div className="mt-4">
          <AvatarPicker
            games={[...avatarGames.values()]}
            current={currentAvatar}
            displayName={profile?.name || profile?.username || user.email || "Player"}
          />
        </div>
      </Section>

      <Section title="Social links">
        <p className="mt-1 text-sm text-fog">Shown on your public profile.</p>
        <div className="mt-4">
          <SocialLinksForm instagram={profile?.instagram ?? null} bluesky={profile?.bluesky ?? null} />
        </div>
      </Section>

      <Section id="blocked" title="Blocked accounts">
        <p className="mt-1 text-sm text-fog">
          Blocked people can&apos;t follow you and you won&apos;t see each other&apos;s activity. They can still see
          your public profile.
        </p>
        <div className="mt-3">
          <BlockedList
            people={blocked.flatMap((b) => (b.blocked.username ? [{ username: b.blocked.username, name: b.blocked.name }] : []))}
          />
        </div>
      </Section>


      {raConfigured() && (
        <Section id="retroachievements" title="RetroAchievements">
          <p className="mt-1 text-sm text-fog">
            Import the games you&apos;ve beaten and mastered on
            RetroAchievements. Link your public username; you review every
            game before it&apos;s added to your diary.
          </p>
          <div className="mt-4">
            <RetroAchievementsLink
              account={
                raAccount
                  ? {
                      raUsername: raAccount.raUsername,
                      profileUrl: raProfileUrl(raAccount.raUsername),
                      lastSynced: raAccount.lastSyncedAt ? formatDate(raAccount.lastSyncedAt) : null,
                    }
                  : null
              }
              reviewCount={raPending.length}
            />
          </div>
        </Section>
      )}

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
