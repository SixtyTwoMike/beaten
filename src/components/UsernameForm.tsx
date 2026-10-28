"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setUsername } from "@/app/actions/auth";
import { USERNAME_CHANGE_DAYS } from "@/lib/limits";
import { safeAction } from "@/lib/safe-action";

// `nextChange`: formatted date the username can next be changed, if it's
// still within the wait. `invite`: a code for a reserved name, from
// /settings?invite=… (skips the wait).
export function UsernameForm({
  current,
  nextChange,
  invite,
}: {
  current: string | null;
  nextChange: string | null;
  invite: { code: string; username: string } | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(invite?.username ?? current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await safeAction(() => setUsername(value, invite?.code));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="settings-username" className="block text-sm text-fog">
        Username
      </label>
      <div className="flex gap-2">
        <input
          id="settings-username"
          name="handle"
          required
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="username"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-md border border-edge bg-canvas px-3 py-2 text-sm outline-none placeholder:text-fog/70 focus:border-mint/60 focus:ring-1 focus:ring-mint/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50 transition"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {invite && invite.username !== current && (
        <p className="text-sm text-mint">
          You&apos;ve been invited to take <span className="font-semibold">@{invite.username}</span> — press Save to claim it.
        </p>
      )}
      {!invite && current && (
        <p className="text-xs text-fog">
          {nextChange
            ? `You can change it again on ${nextChange}.`
            : `You can change your username once every ${USERNAME_CHANGE_DAYS} days.`}
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {saved && <p className="text-sm text-mint">Saved.</p>}
      {current && (
        <p className="text-sm text-fog">
          Your profile:{" "}
          <Link href={`/${current}`} className="text-mint hover:underline">
            beaten.games/{current}
          </Link>
        </p>
      )}
    </form>
  );
}
