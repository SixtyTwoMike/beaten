import { prisma } from "./db";
import { gameJson, logJson } from "./api-json";
import { resolveAvatar } from "./avatar";
import { feedVerb, type FeedCard } from "./feed";
import { toPartialInput } from "./format";
import { canSocialise, followCounts, newFollowerCount, type PublicUser } from "./follows";
import { isFinishedStatus } from "./status";
import { normalizeUsername } from "./username";
import { describeNotification, unreadNotificationCount, type NotificationRow } from "./notifications";
import { reviewFor, reviewSocialFor, type CommentView } from "./review-social";
import { blockedEitherWay } from "./follows";

// JSON for the app's social screens (mirrored by
// ios/Beaten/API/SocialModels.swift): feeds, people, profiles, comments.

export function personJson(u: PublicUser) {
  return { username: u.username, name: u.name, avatar: resolveAvatar(u), imageUrl: u.image };
}

export function feedCardJson(card: FeedCard) {
  if (card.kind === "backfill") {
    return { kind: card.kind, key: card.key, actor: personJson(card.actor), games: card.games.map(gameJson), at: card.at.toISOString() };
  }
  return {
    kind: card.kind,
    key: card.key,
    logId: card.logId,
    actor: personJson(card.actor),
    game: gameJson(card.game),
    verb: feedVerb(card.types),
    reviewed: card.types.includes("REVIEWED"),
    log: {
      status: card.log.status,
      rating: card.log.rating,
      reviewText: card.log.reviewText,
      containsSpoilers: card.log.containsSpoilers,
      finishedAt: card.log.finishedAt ? toPartialInput(card.log.finishedAt, card.log.finishedPrecision) : null,
      isReplay: card.log.isReplay,
      notReturning: card.log.notReturning,
    },
    at: card.at.toISOString(),
    social: card.social ?? null,
  };
}

export function commentJson(c: CommentView) {
  return { id: c.id, body: c.body, createdAt: c.createdAt.toISOString(), author: personJson(c.author), canDelete: c.canDelete };
}

// The viewer's follower numbers, for their own profile tab.
export async function mySocialJson(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { followersSeenAt: true } });
  const [counts, newFollowers, unreadNotifications] = await Promise.all([
    followCounts(userId),
    newFollowerCount(userId, user.followersSeenAt),
    unreadNotificationCount(userId),
  ]);
  return { ...counts, newFollowers, unreadNotifications };
}

const GRID = 48;

// Someone's public profile (as /<username>) plus how the viewer stands with
// them. Null when there's no such profile.
export async function profileJson(viewerId: string, raw: string) {
  const user = await prisma.user.findUnique({
    where: { username: normalizeUsername(raw) },
    select: {
      id: true,
      username: true,
      name: true,
      image: true,
      emailVerifiedAt: true,
      createdAt: true,
      instagram: true,
      bluesky: true,
      avatarSource: true,
      avatarX: true,
      avatarY: true,
      avatarZoom: true,
      avatarGame: { select: { coverUrl: true, artworkUrl: true } },
    },
  });
  if (!user?.username) return null;
  const isYou = user.id === viewerId;
  const [viewer, counts, following, blocking, logs] = await Promise.all([
    prisma.user.findUnique({ where: { id: viewerId }, select: { username: true, emailVerifiedAt: true } }),
    followCounts(user.id),
    prisma.follow.count({ where: { followerId: viewerId, followeeId: user.id } }),
    prisma.block.count({ where: { blockerId: viewerId, blockedId: user.id } }),
    prisma.playLog.findMany({
      where: { userId: user.id },
      orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
      include: { game: true },
    }),
  ]);

  // Reactions on their reviews, unless there's a block either way.
  const reviewLogs = logs.filter((l) => isFinishedStatus(l.status) && l.reviewText).slice(0, 10);
  const blocked = !isYou && (await blockedEitherWay(viewerId)).has(user.id);
  const social = canSocialise(user) && !blocked ? await reviewSocialFor(viewerId, reviewLogs.map((l) => l.id)) : new Map();

  const playing = new Map<string, (typeof logs)[number]>();
  for (const l of logs) if (l.status === "PLAYING" && !playing.has(l.gameId)) playing.set(l.gameId, l);
  const finished = logs.filter((l) => isFinishedStatus(l.status));
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));

  return {
    user: personJson(user),
    memberSince: user.createdAt.toISOString(),
    instagram: user.instagram,
    bluesky: user.bluesky,
    counts,
    relation: {
      isYou,
      following: following > 0,
      blocked: blocking > 0,
      // As the web: the controls show when both can socialise; following
      // someone who's blocked you is refused like any other "no".
      canFollow: !isYou && canSocialise(viewer) && canSocialise(user),
    },
    stats: {
      playing: playing.size,
      beaten: new Set(finished.map((l) => l.gameId)).size,
      mastered: new Set(logs.filter((l) => l.status === "MASTERED").map((l) => l.gameId)).size,
      finishedThisYear: finished.filter((l) => l.finishedAt && l.finishedAt >= yearStart).length,
      year: yearStart.getUTCFullYear(),
    },
    playing: [...playing.values()].map((l) => gameJson(l.game)),
    finished: finished.slice(0, GRID).map(logJson),
    finishedTotal: finished.length,
    reviews: reviewLogs.map((l) => ({ ...logJson(l), social: social.get(l.id) ?? null })),
  };
}

// One review (GET /api/v1/reviews/:id), as the web's review page.
export async function reviewJson(viewerId: string, logId: string) {
  const r = await reviewFor(viewerId, logId);
  if (!r) return null;
  return { log: logJson(r.log), author: personJson(r.author), social: r.social, isYours: r.isYours };
}

export function notificationJson(n: NotificationRow) {
  return {
    id: n.id,
    type: n.type,
    actor: personJson(n.actor),
    reaction: n.reaction,
    comment: n.comment?.body ?? null,
    text: describeNotification(n),
    logId: n.playLog.id,
    game: n.playLog.game,
    createdAt: n.createdAt.toISOString(),
    read: Boolean(n.readAt),
  };
}
