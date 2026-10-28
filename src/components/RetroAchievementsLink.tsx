"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  linkRetroAchievements,
  syncRetroAchievements,
  unlinkRetroAchievements,
} from "@/app/actions/retroachievements";
import { safeAction } from "@/lib/safe-action";
import { inputClass } from "./AuthForms";

function syncedMessage(added?: number, unmatched?: number): string {
  const parts = [added ? `${added} new award${added === 1 ? "" : "s"}` : "No new awards"];
  if (unmatched) parts.push(`${unmatched} still to match — sync again in a minute`);
  return parts.join(" · ");
}

export function RetroAchievementsLink({
  account,
  reviewCount,
}: {
  account: { raUsername: string; profileUrl: string; lastSynced: string | null } | null;
  reviewCount: number;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [busy, startTransition] = useTransition();

  function link(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await safeAction(() => linkRetroAchievements(username));
      if (!result.ok) return setError(result.error);
      setNotice(syncedMessage(result.added, result.unmatched));
      router.refresh();
    });
  }

  function sync() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await safeAction(() => syncRetroAchievements());
      if (!result.ok) return setError(result.error);
      setNotice(syncedMessage(result.added, result.unmatched));
      router.refresh();
    });
  }

  function unlink() {
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() => unlinkRetroAchievements());
      if (!result.ok) return setError(result.error);
      setConfirmUnlink(false);
      setNotice(null);
      router.refresh();
    });
  }

  const button =
    "rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50 transition";
  const quiet =
    "rounded-md border border-edge px-3 py-2 text-sm text-fog hover:border-fog/50 hover:text-white disabled:opacity-50 transition";

  return (
    <div className="space-y-3">
      {account ? (
        <>
          <p className="text-sm">
            <span className="text-fog">Linked to </span>
            <a href={account.profileUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-white hover:text-mint">
              {account.raUsername}
            </a>
            {account.lastSynced && <span className="text-fog"> · last synced {account.lastSynced}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={sync} disabled={busy} className={button}>
              {busy ? "Syncing…" : "Sync now"}
            </button>
            {reviewCount > 0 && (
              <Link href="/import/retroachievements" className={quiet}>
                Review {reviewCount} to import →
              </Link>
            )}
            {confirmUnlink ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-fog">Unlink? Imported games stay in your diary.</span>
                <button type="button" onClick={unlink} disabled={busy} className="rounded-md bg-red-500/90 px-2.5 py-1 font-semibold text-white hover:bg-red-500">
                  Unlink
                </button>
                <button type="button" onClick={() => setConfirmUnlink(false)} className="text-fog hover:text-white">
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmUnlink(true)} className="text-sm text-fog hover:text-white">
                Unlink
              </button>
            )}
          </div>
        </>
      ) : (
        <form onSubmit={link} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-label="RetroAchievements username"
            placeholder="RetroAchievements username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            className={`${inputClass} sm:flex-1`}
          />
          <button type="submit" disabled={busy || !username.trim()} className={button}>
            {busy ? "Linking…" : "Link account"}
          </button>
        </form>
      )}
      {notice && <p className="text-sm text-mint">{notice}</p>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
