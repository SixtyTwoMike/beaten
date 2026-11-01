import { prisma } from "./db";
import { appUrl, sendEmail } from "./email";
import { PUBLIC_USER_SELECT, blockedEitherWay } from "./follows";
import { REACTION_EMOJI, isReaction } from "./reactions";

// Notifications: someone commented on or reacted to your review. Every one
// is listed in the app and on the web (/notifications); email alerts go out
// as often as each person chooses, per type:
// - instant: within a few minutes (the job runs every 15 minutes, so a
//   burst arrives as one email);
// - daily / weekly: one email once the oldest unsent one is a day / week
//   old, covering everything since;
// - off: never emailed.
// Ones already seen in the app or on the web aren't emailed. People blocked
// either way are left out everywhere.

export const FREQUENCIES = ["instant", "daily", "weekly", "off"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FREQUENCY_LABEL: Record<Frequency, string> = {
  instant: "As they happen",
  daily: "Daily summary",
  weekly: "Weekly summary",
  off: "Off",
};
export const isFrequency = (v: unknown): v is Frequency => FREQUENCIES.includes(v as Frequency);

export type NotificationSettings = { comments: Frequency; reactions: Frequency };

const asFrequency = (v: string, fallback: Frequency): Frequency => (isFrequency(v) ? v : fallback);

export async function notificationSettingsFor(userId: string): Promise<NotificationSettings> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { notifyComments: true, notifyReactions: true } });
  return { comments: asFrequency(u.notifyComments, "instant"), reactions: asFrequency(u.notifyReactions, "daily") };
}

export async function saveNotificationSettingsForUser(
  userId: string,
  input: { comments?: unknown; reactions?: unknown }
): Promise<{ ok: true; settings: NotificationSettings } | { ok: false; error: string }> {
  if ((input.comments !== undefined && !isFrequency(input.comments)) || (input.reactions !== undefined && !isFrequency(input.reactions))) {
    return { ok: false, error: "Choose how often" };
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.comments !== undefined && { notifyComments: input.comments as Frequency }),
      ...(input.reactions !== undefined && { notifyReactions: input.reactions as Frequency }),
    },
  });
  return { ok: true, settings: await notificationSettingsFor(userId) };
}

// --- recording (called from lib/review-social.ts)

export async function notifyComment(reviewAuthorId: string, actorId: string, playLogId: string, commentId: string) {
  if (reviewAuthorId === actorId) return;
  await prisma.notification.create({ data: { userId: reviewAuthorId, actorId, type: "COMMENT", playLogId, commentId } });
}

export async function notifyReaction(reviewAuthorId: string, actorId: string, playLogId: string, reaction: string, added: boolean) {
  if (reviewAuthorId === actorId) return;
  if (added) {
    await prisma.notification.create({ data: { userId: reviewAuthorId, actorId, type: "REACTION", playLogId, reaction } });
  } else {
    // Taken back: so is the notification, unless it was already emailed.
    await prisma.notification.deleteMany({ where: { userId: reviewAuthorId, actorId, type: "REACTION", playLogId, reaction, emailedAt: null } });
  }
}

// --- reading

const INCLUDE = {
  actor: { select: PUBLIC_USER_SELECT },
  comment: { select: { body: true } },
  playLog: { select: { id: true, game: { select: { igdbId: true, name: true, coverUrl: true } }, user: { select: { username: true } } } },
} as const;

export const NOTIFICATIONS_PAGE = 30;

export async function notificationsFor(userId: string, before?: Date) {
  const hidden = [...(await blockedEitherWay(userId))];
  const rows = await prisma.notification.findMany({
    where: { userId, actorId: { notIn: hidden }, ...(before && { createdAt: { lt: before } }) },
    orderBy: { createdAt: "desc" },
    take: NOTIFICATIONS_PAGE + 1,
    include: INCLUDE,
  });
  return { items: rows.slice(0, NOTIFICATIONS_PAGE), more: rows.length > NOTIFICATIONS_PAGE };
}

export type NotificationRow = Awaited<ReturnType<typeof notificationsFor>>["items"][number];

export async function unreadNotificationCount(userId: string): Promise<number> {
  const hidden = [...(await blockedEitherWay(userId))];
  return prisma.notification.count({ where: { userId, readAt: null, actorId: { notIn: hidden } } });
}

export async function markNotificationsRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

export function reviewPath(username: string | null, playLogId: string): string {
  return `/${username}/reviews/${playLogId}`;
}

// "Sam commented on your review of Celeste: “…”"
export function describeNotification(n: NotificationRow): string {
  const who = n.actor.name || `@${n.actor.username}`;
  const game = n.playLog.game.name;
  if (n.type === "COMMENT") {
    const body = (n.comment?.body ?? "").replace(/\s+/g, " ");
    return `${who} commented on your review of ${game}: “${body.length > 140 ? `${body.slice(0, 139)}…` : body}”`;
  }
  const emoji = isReaction(n.reaction) ? REACTION_EMOJI[n.reaction] : "";
  return `${who} reacted ${emoji} to your review of ${game}`;
}

// --- email (run every 15 minutes: `beaten-admin notify`)

const WINDOW: Record<Exclude<Frequency, "off">, number> = {
  instant: 2 * 60 * 1000, // a moment's grace, so a reaction taken straight back never sends
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export async function sendNotificationEmails(now = new Date()): Promise<{ emails: number; notifications: number }> {
  const pending = await prisma.notification.findMany({
    where: { emailedAt: null, readAt: null },
    orderBy: { createdAt: "asc" },
    include: { ...INCLUDE, user: { select: { id: true, email: true, username: true, emailVerifiedAt: true, notifyComments: true, notifyReactions: true } } },
  });
  const byUser = new Map<string, typeof pending>();
  for (const n of pending) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);

  let emails = 0;
  let notifications = 0;
  for (const [userId, rows] of byUser) {
    const user = rows[0].user;
    if (!user.emailVerifiedAt) continue;
    const hidden = await blockedEitherWay(userId);
    const due = (["COMMENT", "REACTION"] as const).flatMap((type) => {
      const freq = asFrequency(type === "COMMENT" ? user.notifyComments : user.notifyReactions, type === "COMMENT" ? "instant" : "daily");
      const ofType = rows.filter((r) => r.type === type && !hidden.has(r.actorId));
      if (freq === "off" || ofType.length === 0) return [];
      return now.getTime() - ofType[0].createdAt.getTime() >= WINDOW[freq] ? ofType : [];
    });
    if (due.length === 0) continue;
    await sendEmail(notificationEmail(user, due));
    await prisma.notification.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { emailedAt: now } });
    emails++;
    notifications += due.length;
  }
  return { emails, notifications };
}

function notificationEmail(user: { email: string; username: string | null }, rows: NotificationRow[]) {
  const base = appUrl();
  const comments = rows.filter((r) => r.type === "COMMENT").length;
  const reactions = rows.length - comments;
  const subject =
    rows.length === 1
      ? describeNotification(rows[0]).replace(/: “[\s\S]*$/, "")
      : [comments && `${comments} new comment${comments === 1 ? "" : "s"}`, reactions && `${reactions} reaction${reactions === 1 ? "" : "s"}`]
          .filter(Boolean)
          .join(" and ") + " on your reviews";
  const lines = rows.map((r) => `- ${describeNotification(r)}\n  ${base}${reviewPath(user.username, r.playLogId)}`);
  return {
    to: user.email,
    subject,
    text: [
      "Here's what's new on your Beaten reviews:",
      "",
      ...lines,
      "",
      `All notifications: ${base}/notifications`,
      `Change how often we email you: ${base}/settings#notifications`,
    ].join("\n"),
  };
}
