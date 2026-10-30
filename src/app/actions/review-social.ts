"use server";

import { requireUserId } from "@/lib/session";
import {
  addCommentForUser,
  commentsForUser,
  deleteCommentForUser,
  toggleReactionForUser,
  type CommentView,
  type ReviewSocial,
  type SocialResult,
} from "@/lib/review-social";

// Reactions and comments on reviews in the feed (lib/review-social.ts).

async function run<T>(label: string, call: (userId: string) => Promise<SocialResult<T>>): Promise<SocialResult<T>> {
  try {
    return await call(await requireUserId());
  } catch (e) {
    console.error(`${label} failed:`, e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function toggleReaction(logId: string, kind: string): Promise<SocialResult<ReviewSocial>> {
  return run("toggleReaction", (userId) => toggleReactionForUser(userId, logId, kind));
}

export async function loadComments(logId: string): Promise<SocialResult<CommentView[]>> {
  return run("loadComments", (userId) => commentsForUser(userId, logId));
}

export async function addComment(logId: string, body: string): Promise<SocialResult<CommentView[]>> {
  return run("addComment", (userId) => addCommentForUser(userId, logId, body));
}

export async function deleteComment(commentId: string): Promise<SocialResult<null>> {
  return run("deleteComment", (userId) => deleteCommentForUser(userId, commentId));
}
