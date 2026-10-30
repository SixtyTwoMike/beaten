// Reactions on reviews: a small fixed set, shared by the server
// (lib/review-social.ts), the web feed and the iPhone app.

export const REACTIONS = ["heart", "fire", "laugh", "wow", "gg"] as const;
export type ReactionKind = (typeof REACTIONS)[number];
export const REACTION_EMOJI: Record<ReactionKind, string> = { heart: "❤️", fire: "🔥", laugh: "😂", wow: "😮", gg: "🏆" };
export const REACTION_LABEL: Record<ReactionKind, string> = { heart: "Love", fire: "Fire", laugh: "Funny", wow: "Wow", gg: "GG" };

export const COMMENT_MAX = 1000;

export type ReviewSocial = {
  reactions: { kind: ReactionKind; count: number; mine: boolean }[];
  commentCount: number;
};

export const isReaction = (v: unknown): v is ReactionKind => REACTIONS.includes(v as ReactionKind);
