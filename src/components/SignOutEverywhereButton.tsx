"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { signOutEverywhere } from "@/app/actions/auth";
import { safeAction } from "@/lib/safe-action";

export function SignOutEverywhereButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() => signOutEverywhere());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await signOut({ callbackUrl: "/login" });
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md border border-red-400/40 px-3 py-1.5 text-sm text-red-300 hover:border-red-400 disabled:opacity-50 transition"
      >
        {pending ? "Signing out…" : "Sign out everywhere"}
      </button>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
