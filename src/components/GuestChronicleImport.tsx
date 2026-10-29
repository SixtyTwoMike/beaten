"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { importGuestChronicle } from "@/app/actions/chronicle";
import { clearGuestChronicle, readGuestChronicle, toImport } from "@/lib/guest-chronicle";
import { safeAction } from "@/lib/safe-action";

// A Console Chronicle made before signing up (saved in this browser),
// brought into the account. Browser-only (rendered via next/dynamic).
//
// - On the chronicles editor: copied in automatically when the account has
//   no consoles yet; otherwise they choose to replace theirs or discard it.
// - Elsewhere in the app: a pointer to the editor.
export function GuestChronicleImport({ hasChronicle }: { hasChronicle: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const onEditor = pathname === "/extras/chronicles";
  const [data] = useState(() => readGuestChronicle());
  const count = data?.entries.length ?? 0;
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, startTransition] = useTransition();
  const started = useRef(false);

  function bringAcross(mode: "if-empty" | "replace") {
    if (!data) return;
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() => importGuestChronicle(toImport(data), mode));
      if (!result.ok) return setError(result.error);
      clearGuestChronicle();
      setDone(`Your chronicle from this device is now in your account (${result.imported} console${result.imported === 1 ? "" : "s"}).`);
      router.refresh();
    });
  }

  function discard() {
    clearGuestChronicle();
    setGone(true);
  }

  useEffect(() => {
    if (onEditor && count > 0 && !hasChronicle && !started.current) {
      started.current = true;
      bringAcross("if-empty");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEditor, count, hasChronicle]);

  if (done) return <p className="mb-6 rounded-xl border border-mint/30 bg-mint/5 p-4 text-sm text-mint">{done}</p>;
  if (gone || count === 0) return null;

  if (!onEditor) {
    return (
      <p className="mb-6 rounded-xl border border-mint/30 bg-mint/5 p-4 text-sm">
        You made a console chronicle before signing in.{" "}
        <Link href="/extras/chronicles" className="font-semibold text-mint hover:underline">
          Add it to your account →
        </Link>
      </p>
    );
  }

  if (!hasChronicle) {
    return (
      <p className="mb-6 rounded-xl border border-edge bg-card p-4 text-sm text-fog">
        {error ?? "Bringing across the chronicle you made on this device…"}
      </p>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-gold/40 bg-gold/5 p-4 text-sm">
      <p>
        You made a chronicle on this device before signing in ({count} console{count === 1 ? "" : "s"}), but your
        account already has one.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => bringAcross("replace")} className="rounded-md bg-mint px-3 py-1.5 font-semibold text-canvas hover:brightness-110 disabled:opacity-50">
          {busy ? "Replacing…" : "Use the one from this device"}
        </button>
        <button type="button" disabled={busy} onClick={discard} className="rounded-md border border-edge px-3 py-1.5 text-fog hover:text-white">
          Keep my account&apos;s, discard this one
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-red-400">{error}</p>}
    </div>
  );
}
