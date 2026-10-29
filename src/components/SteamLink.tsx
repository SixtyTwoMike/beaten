"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { syncSteam, unlinkSteam, type SteamSyncResult } from "@/app/actions/steam";
import { safeAction } from "@/lib/safe-action";

const RESULT_MESSAGES: Record<string, { text: string; error?: boolean }> = {
  linked: { text: "Steam account linked." },
  taken: { text: "That Steam account is already linked to another Beaten account.", error: true },
  failed: { text: "Steam didn't confirm the sign-in — try again.", error: true },
  expired: { text: "That sign-in took too long or came from another browser — try again.", error: true },
  unreachable: { text: "Couldn't reach Steam — try again shortly.", error: true },
};

function syncedMessage(r: SteamSyncResult): string {
  const parts = [r.added ? `${r.added} new game${r.added === 1 ? "" : "s"}` : "No new games"];
  if (r.remaining) parts.push(`achievements for ${r.remaining} more still to fetch — sync again in a minute`);
  return parts.join(" · ");
}

export function SteamLink({
  account,
  reviewCount,
  linkResult,
}: {
  account: {
    personaName: string | null;
    profileUrl: string;
    privacyUrl: string;
    lastSynced: string | null;
    neverSynced: boolean;
    privateLibrary: boolean;
  } | null;
  reviewCount: number;
  linkResult: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [busy, startTransition] = useTransition();
  const result = linkResult ? RESULT_MESSAGES[linkResult] : null;

  function sync() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const r = await safeAction(() => syncSteam());
      if (!r.ok) return setError(r.error);
      if (!r.privateLibrary) setNotice(syncedMessage(r));
      router.refresh();
    });
  }

  // Fetch the library straight after linking.
  const autoSynced = useRef(false);
  useEffect(() => {
    if (account?.neverSynced && !autoSynced.current) {
      autoSynced.current = true;
      sync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.neverSynced]);

  function unlink() {
    setError(null);
    startTransition(async () => {
      const r = await safeAction(() => unlinkSteam());
      if (!r.ok) return setError(r.error);
      setConfirmUnlink(false);
      setNotice(null);
      router.replace("/settings#steam");
      router.refresh();
    });
  }

  const button =
    "inline-block rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50 transition";
  const quiet =
    "rounded-md border border-edge px-3 py-2 text-sm text-fog hover:border-fog/50 hover:text-white disabled:opacity-50 transition";

  return (
    <div className="space-y-3">
      {result && !notice && !error && (
        <p className={`text-sm ${result.error ? "text-red-400" : "text-mint"}`}>{result.text}</p>
      )}
      {account ? (
        <>
          <p className="text-sm">
            <span className="text-fog">Linked to </span>
            <a href={account.profileUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-white hover:text-mint">
              {account.personaName ?? "your Steam account"}
            </a>
            {account.lastSynced && <span className="text-fog"> · last synced {account.lastSynced}</span>}
          </p>
          {account.privateLibrary && (
            <div className="rounded-md bg-gold/10 px-3 py-2 text-sm text-gold">
              Steam isn&apos;t sharing your games. On Steam, set{" "}
              <strong>Privacy Settings → Game details</strong> to <strong>Public</strong>{" "}
              (
              <a href={account.privacyUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
                open your Steam privacy settings
              </a>
              ), then sync again. You can set it back afterwards; games already
              fetched stay here.
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={sync} disabled={busy} className={button}>
              {busy ? "Syncing…" : "Sync now"}
            </button>
            {reviewCount > 0 && (
              <Link href="/import/steam" className={quiet}>
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
        // A full page load (not <Link>): the sign-in happens on Steam's own site.
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a href="/api/steam/login" className={button}>
          Sign in through Steam
        </a>
      )}
      {notice && <p className="text-sm text-mint">{notice}</p>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
