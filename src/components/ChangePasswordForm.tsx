"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { changePassword } from "@/app/actions/auth";
import { buttonClass, inputClass } from "./AuthForms";
import { NewPasswordField } from "./NewPasswordField";

export function ChangePasswordForm({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await changePassword({ currentPassword, newPassword });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Every session (this one included) was revoked by the change.
      await signOut({ callbackUrl: "/login?changed=1" });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {/* Tells Keychain / Google Password Manager which saved login to update. */}
      <input
        type="email"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        hidden
      />
      <input
        type="password"
        required
        name="password"
        id="current-password"
        autoComplete="current-password"
        maxLength={128}
        placeholder="Current password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        className={inputClass}
      />
      <NewPasswordField
        id="change-new-password"
        value={newPassword}
        onChange={setNewPassword}
        placeholder="New password"
        className={inputClass}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={pending} className={`${buttonClass} sm:w-auto sm:px-4`}>
        {pending ? "Changing…" : "Change password"}
      </button>
      <p className="text-xs text-fog/70">
        You&apos;ll be signed out everywhere and asked to sign in again.
      </p>
    </form>
  );
}
