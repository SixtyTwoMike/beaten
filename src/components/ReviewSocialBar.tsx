"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addComment, deleteComment, loadComments, toggleReaction } from "@/app/actions/review-social";
import { resolveAvatar } from "@/lib/avatar";
import { timeAgo } from "@/lib/format";
import { COMMENT_MAX, REACTION_EMOJI, REACTION_LABEL, type ReviewSocial } from "@/lib/reactions";
import type { CommentView } from "@/lib/review-social";
import { safeAction } from "@/lib/safe-action";
import { Avatar } from "./Avatar";

// Reactions and comments under a review in the feed. Reactions update at
// once and settle on what the server says; comments load when opened.
export function ReviewSocialBar({
  logId,
  social: initial,
  reportEmail,
}: {
  logId: string;
  social: ReviewSocial;
  reportEmail: string;
}) {
  const [social, setSocial] = useState(initial);
  const [picking, setPicking] = useState(false);
  const [comments, setComments] = useState<CommentView[] | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = social.reactions.filter((r) => r.count > 0);
  const commentCount = comments?.length ?? social.commentCount;

  function react(kind: (typeof social.reactions)[number]["kind"]) {
    setPicking(false);
    setError(null);
    const before = social;
    setSocial({
      ...social,
      reactions: social.reactions.map((r) => (r.kind === kind ? { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) } : r)),
    });
    startTransition(async () => {
      const result = await safeAction(() => toggleReaction(logId, kind));
      if (result.ok) setSocial(result.value);
      else {
        setSocial(before);
        setError(result.error);
      }
    });
  }

  function toggleComments() {
    const next = !open;
    setOpen(next);
    if (next && !comments) {
      startTransition(async () => {
        const result = await safeAction(() => loadComments(logId));
        // A comment posted meanwhile already brought the latest list.
        if (result.ok) setComments((cs) => cs ?? result.value);
        else setError(result.error);
      });
    }
  }

  function post(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() => addComment(logId, draft));
      if (!result.ok) return setError(result.error);
      setComments(result.value);
      setDraft("");
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() => deleteComment(id));
      if (!result.ok) return setError(result.error);
      setComments((cs) => cs?.filter((c) => c.id !== id) ?? null);
    });
  }

  return (
    <div className="mt-3">
      <div
        className="relative flex flex-wrap items-center gap-1.5 text-xs"
        onKeyDown={(e) => e.key === "Escape" && setPicking(false)}
      >
        {shown.map((r) => (
          <button
            key={r.kind}
            type="button"
            onClick={() => react(r.kind)}
            aria-pressed={r.mine}
            aria-label={`${REACTION_LABEL[r.kind]}, ${r.count}`}
            className="rounded-full border border-edge px-2 py-0.5 text-fog hover:border-fog/50 aria-pressed:border-mint/60 aria-pressed:bg-mint/10 aria-pressed:text-white"
          >
            {REACTION_EMOJI[r.kind]} <span className="tabular-nums">{r.count}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          aria-expanded={picking}
          aria-label="React"
          className="rounded-full border border-edge px-2 py-0.5 text-fog hover:border-fog/50 hover:text-white"
        >
          {shown.length ? "+" : "☺ React"}
        </button>
        <button
          type="button"
          onClick={toggleComments}
          aria-expanded={open}
          className="ml-1 rounded-full px-2 py-0.5 text-fog hover:text-white"
        >
          💬 {commentCount === 0 ? "Comment" : `${commentCount} comment${commentCount === 1 ? "" : "s"}`}
        </button>
        {picking && (
          <div
            role="menu"
            className="absolute left-0 top-full z-20 mt-1 flex gap-1 rounded-full border border-edge bg-card-2 p-1 shadow-xl"
          >
            {social.reactions.map((r) => (
              <button
                key={r.kind}
                type="button"
                role="menuitemcheckbox"
                aria-checked={r.mine}
                aria-label={REACTION_LABEL[r.kind]}
                title={REACTION_LABEL[r.kind]}
                onClick={() => react(r.kind)}
                className="rounded-full px-1.5 py-0.5 text-base hover:bg-card aria-checked:bg-mint/15"
              >
                {REACTION_EMOJI[r.kind]}
              </button>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-edge pt-3">
          {comments === null ? (
            <p className="text-xs text-fog">Loading…</p>
          ) : (
            comments.length > 0 && (
              <ul className="space-y-3">
                {comments.map((c) => (
                  <li key={c.id} className="flex gap-2">
                    <Link href={`/${c.author.username}`} className="shrink-0">
                      <Avatar
                        avatar={resolveAvatar(c.author)}
                        image={c.author.image}
                        name={c.author.name || c.author.username || "?"}
                        size={24}
                      />
                    </Link>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="text-xs text-fog">
                        <Link href={`/${c.author.username}`} className="font-semibold text-white hover:text-mint">
                          {c.author.name || `@${c.author.username}`}
                        </Link>
                        <span className="text-fog/70"> · {timeAgo(c.createdAt)}</span>
                        {c.canDelete && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => remove(c.id)}
                            className="ml-2 hover:text-red-300"
                          >
                            Delete
                          </button>
                        )}
                        <a
                          href={`mailto:${reportEmail}?subject=${encodeURIComponent(`Report a comment by @${c.author.username}`)}&body=${encodeURIComponent(`Comment: ${c.id}\n\n“${c.body.slice(0, 300)}”\n\nWhat's wrong:\n`)}`}
                          className="ml-2 hover:text-white"
                        >
                          Report
                        </a>
                      </p>
                      <p className="whitespace-pre-line break-words text-fog/90">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}
          {comments !== null && (
            <form onSubmit={post} className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={COMMENT_MAX}
                rows={1}
                placeholder="Add a comment…"
                aria-label="Add a comment"
                className="min-h-9 w-full resize-y rounded-md border border-edge bg-canvas px-3 py-1.5 text-sm outline-none focus:border-mint/60"
              />
              <button
                type="submit"
                disabled={pending || !draft.trim()}
                className="rounded-md bg-mint px-3 py-1.5 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50"
              >
                Post
              </button>
            </form>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
