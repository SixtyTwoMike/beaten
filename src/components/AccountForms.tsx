"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestPasswordReset, resetPassword, verifyEmail } from "@/app/actions/account";
import { buttonClass, inputClass } from "./AuthForms";
import { NewPasswordField } from "./NewPasswordField";
import { safeAction } from "@/lib/safe-action";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-xl border border-edge bg-card p-6 shadow-xl">
      <h1 className="mb-4 text-lg font-semibold">{title}</h1>
      {children}
    </div>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() => requestPasswordReset(email));
      if (!result.ok) setError(result.error);
      else setSent(true);
    });
  }

  if (sent) {
    return (
      <Card title="Check your email">
        <p className="text-sm text-fog">
          If there&apos;s a Beaten account for{" "}
          <span className="text-white">{email}</span>, we&apos;ve sent a link to
          reset the password. It works for 30 minutes.
        </p>
        <p className="mt-4 text-sm text-fog">
          Nothing arrived? Check spam, or{" "}
          <Link href="/support" className="text-mint hover:underline">
            contact support
          </Link>
          .
        </p>
      </Card>
    );
  }

  return (
    <Card title="Forgot your password?">
      <p className="mb-4 text-sm text-fog">
        Enter your account&apos;s email and we&apos;ll send you a reset link.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          name="email"
          id="forgot-email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={254}
          aria-label="Email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="mt-5 text-sm text-fog">
        Remembered it?{" "}
        <Link href="/login" className="text-mint hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}

// The token arrives in the query string; take it out of the address bar (and
// so out of history and any later Referer) once the page has it.
function useHideTokenFromUrl() {
  useEffect(() => {
    if (window.location.search.includes("token=")) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, []);
}

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  useHideTokenFromUrl();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() => resetPassword({ token, newPassword: password }));
      if (!result.ok) setError(result.error);
      else router.replace("/login?reset=1");
    });
  }

  return (
    <Card title="Choose a new password">
      <form onSubmit={submit} className="space-y-3">
        {/* Read-only account field so password managers save the new
            password against the right login. */}
        <input
          type="email"
          name="username"
          id="reset-username"
          autoComplete="username"
          value={email}
          readOnly
          aria-label="Account email"
          className={`${inputClass} text-fog`}
        />
        <NewPasswordField
          id="reset-password"
          value={password}
          onChange={setPassword}
          placeholder="New password"
          className={inputClass}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Save new password"}
        </button>
        <p className="text-xs text-fog/85">
          This signs you out on every device.
        </p>
      </form>
    </Card>
  );
}

export function VerifyEmailForm({ token }: { token: string }) {
  useHideTokenFromUrl();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() => verifyEmail(token));
      if (!result.ok) setError(result.error);
      else router.replace("/login?verified=1");
    });
  }

  return (
    <Card title="Confirm your email">
      <p className="mb-4 text-sm text-fog">
        One click and your account is ready.
      </p>
      {error && (
        <p className="mb-3 text-sm text-red-400">
          {error.replace(/\.$/, "")}.{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>{" "}
          to get a new link.
        </p>
      )}
      <button type="button" onClick={confirm} disabled={pending} className={buttonClass}>
        {pending ? "Confirming…" : "Confirm my email"}
      </button>
    </Card>
  );
}
