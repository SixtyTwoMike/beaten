import { prisma } from "./db";
import { PUBLIC_USER_SELECT, blockedEitherWay, canSocialise, type PublicUser } from "./follows";
import { COMMENT_MAX, REACTIONS, isReaction, type ReviewSocial } from "./reactions";
import { TOO_MANY_ATTEMPTS, isLimited, recordAttempt, type Limit } from "./rate-limit";

export type { ReviewSocial } from "./reactions";

// Reactions and comments on reviews, shown under the review in activity
// feeds. Same rules as following: both people need a username and a
// confirmed email, and a block either way stops both (and hides what's
// already there from each other).

export const COMMENT_LIMIT: Limit = { max: 30, windowMs: 10 * 60 * 1000 };
export const REACT_LIMIT: Limit = { max: 200, windowMs: 60 * 60 * 1000 };

export type SocialResult<T> = { ok: true; value: T } | { ok: false; error: string; notFound?: boolean };

const NOT_FOUND = { ok: false as const, error: "That review isn't there any more", notFound: true };

// Reaction counts (all five, zeros included) and comment counts for each
// review, leaving out anyone blocked either way with the viewer.
export async function reviewSocialFor(viewerId: string, logIds: string[]): Promise<Map<string, ReviewSocial>> {
  const out = new Map<string, ReviewSocial>();
  if (logIds.length === 0) return out;
  const hidden = [...(await blockedEitherWay(viewerId))];
  const [reactions, mine, comments] = await Promise.all([
    prisma.reaction.groupBy({
      by: ["playLogId", "kind"],
      where: { playLogId: { in: logIds }, userId: { notIn: hidden } },
      _count: { _all: true },
    }),
    prisma.reaction.findMany({ where: { playLogId: { in: logIds }, userId: viewerId }, select: { playLogId: true, kind: true } }),
    prisma.comment.groupBy({
      by: ["playLogId"],
      where: { playLogId: { in: logIds }, authorId: { notIn: hidden } },
      _count: { _all: true },
    }),
  ]);
  for (const id of logIds) {
    out.set(id, {
      reactions: REACTIONS.map((kind) => ({
        kind,
        count: reactions.find((r) => r.playLogId === id && r.kind === kind)?._count._all ?? 0,
        mine: mine.some((m) => m.playLogId === id && m.kind === kind),
      })),
      commentCount: comments.find((c) => c.playLogId === id)?._count._all ?? 0,
    });
  }
  return out;
}

// The review, if `userId` may react to it and comment on it.
async function reachable(userId: string, logId: string) {
  if (typeof logId !== "string" || logId.length > 40) return null;
  const [log, me] = await Promise.all([
    prisma.playLog.findUnique({
      where: { id: logId },
      select: { id: true, userId: true, reviewText: true, user: { select: { username: true, emailVerifiedAt: true } } },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { username: true, emailVerifiedAt: true } }),
  ]);
  if (!log?.reviewText || !canSocialise(log.user)) return null;
  if (log.userId !== userId && (await blockedEitherWay(userId)).has(log.userId)) return null;
  return { log, canAct: canSocialise(me) };
}

const NEEDS_USERNAME = "Choose a username in Settings to react and comment";

// Adds the reaction, or takes it away if it's already there.
export async function toggleReactionForUser(userId: string, logId: string, kind: unknown): Promise<SocialResult<ReviewSocial>> {
  if (!isReaction(kind)) return { ok: false, error: "Unknown reaction" };
  const found = await reachable(userId, logId);
  if (!found) return NOT_FOUND;
  if (!found.canAct) return { ok: false, error: NEEDS_USERNAME };
  const key = `react:${userId}`;
  if (isLimited(key, REACT_LIMIT)) return { ok: false, error: TOO_MANY_ATTEMPTS };
  recordAttempt(key, REACT_LIMIT);
  const key3 = { playLogId: logId, userId, kind };
  const removed = await prisma.reaction.deleteMany({ where: key3 });
  if (removed.count === 0) await prisma.reaction.upsert({ where: { playLogId_userId_kind: key3 }, update: {}, create: key3 });
  return { ok: true, value: (await reviewSocialFor(userId, [logId])).get(logId)! };
}

export type CommentView = {
  id: string;
  body: string;
  createdAt: Date;
  author: PublicUser;
  canDelete: boolean;
};

// Comments on a review, oldest first, without anyone blocked either way.
export async function commentsForUser(userId: string, logId: string): Promise<SocialResult<CommentView[]>> {
  const found = await reachable(userId, logId);
  if (!found) return NOT_FOUND;
  const hidden = [...(await blockedEitherWay(userId))];
  const rows = await prisma.comment.findMany({
    where: { playLogId: logId, authorId: { notIn: hidden } },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: { author: { select: PUBLIC_USER_SELECT } },
  });
  return {
    ok: true,
    value: rows.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      author: c.author,
      canDelete: c.authorId === userId || found.log.userId === userId,
    })),
  };
}

export async function addCommentForUser(userId: string, logId: string, raw: unknown): Promise<SocialResult<CommentView[]>> {
  const body = typeof raw === "string" ? raw.trim().replace(/\n{3,}/g, "\n\n") : "";
  if (!body) return { ok: false, error: "Write a comment first" };
  if (body.length > COMMENT_MAX) return { ok: false, error: `Comments can be up to ${COMMENT_MAX} characters` };
  const found = await reachable(userId, logId);
  if (!found) return NOT_FOUND;
  if (!found.canAct) return { ok: false, error: NEEDS_USERNAME };
  const key = `comment:${userId}`;
  if (isLimited(key, COMMENT_LIMIT)) return { ok: false, error: TOO_MANY_ATTEMPTS };
  recordAttempt(key, COMMENT_LIMIT);
  await prisma.comment.create({ data: { playLogId: logId, authorId: userId, body } });
  return commentsForUser(userId, logId);
}

// The commenter or the review's author can delete a comment.
export async function deleteCommentForUser(userId: string, commentId: string): Promise<SocialResult<null>> {
  if (typeof commentId !== "string" || commentId.length > 40) return { ok: false, error: "Comment not found", notFound: true };
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { authorId: true, playLog: { select: { userId: true } } },
  });
  if (!comment || (comment.authorId !== userId && comment.playLog.userId !== userId)) {
    return { ok: false, error: "Comment not found", notFound: true };
  }
  await prisma.comment.delete({ where: { id: commentId } });
  return { ok: true, value: null };
}
