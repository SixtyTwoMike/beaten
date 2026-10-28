"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { deleteAccount } from "@/app/actions/account";
import { inputClass } from "./AuthForms";
import { safeAction } from "@/lib/safe-action";

export function DeleteAccountForm({ hasPassword }: { hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() => deleteAccount({ confirmation }));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await signOut({ callbackUrl: "/login?deleted=1" });
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-400/40 px-3 py-1.5 text-sm text-red-300 hover:border-red-400 transition"
      >
        Delete my account…
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-red-400/40 bg-red-400/5 p-4">
      <p className="text-sm text-red-200">
        This permanently deletes your account, every log and review, your
        shelves, and your public profile. It can&apos;t be undone — download
        your data first if you want a copy.
      </p>
      <input
        type={hasPassword ? "password" : "text"}
        required
        id="delete-confirmation"
        autoComplete={hasPassword ? "current-password" : "off"}
        aria-label={hasPassword ? "Your password" : "Type your username or email to confirm"}
        placeholder={hasPassword ? "Your password" : "Type your username or email to confirm"}
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        className={inputClass}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-red-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50 transition"
        >
          {pending ? "Deleting…" : "Permanently delete account"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmation("");
            setError(null);
          }}
          className="rounded-md px-3 py-1.5 text-sm text-fog hover:text-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
