"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resendVerification } from "@/app/actions/account";
import { registerUser } from "@/app/actions/auth";
import { NewPasswordField } from "./NewPasswordField";
import { REQUEST_FAILED, safeAction } from "@/lib/safe-action";

export const inputClass =
  "w-full rounded-md border border-edge bg-canvas px-3 py-2 text-sm outline-none placeholder:text-fog/70 focus:border-mint/60 focus:ring-1 focus:ring-mint/40";

export const buttonClass =
  "w-full rounded-md bg-mint px-3 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition";

function GoogleButton({ callbackUrl = "/" }: { callbackUrl?: string }) {
  return (
    <button
      type="button"
      onClick={() => signIn("google", { callbackUrl })}
      className="w-full rounded-md border border-edge bg-card-2 px-3 py-2 text-sm font-medium hover:border-fog/50 transition"
    >
      Continue with Google
    </button>
  );
}

// Apple's guidelines: black button, Apple logo, "Continue with Apple".
function AppleButton({ callbackUrl = "/" }: { callbackUrl?: string }) {
  return (
    <button
      type="button"
      onClick={() => signIn("apple", { callbackUrl })}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-white/20 bg-black px-3 py-2 text-sm font-medium text-white hover:border-white/40 transition"
    >
      <svg aria-hidden="true" viewBox="0 0 17 20" className="h-4 w-4 fill-current">
        <path d="M14.06 10.62c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.88 1.15 9.13.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.39-.92-2.41-3.65zM11.79 3.88c.63-.77 1.06-1.83.94-2.88-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.76-.96 2.8 1.02.08 2.05-.52 2.68-1.29z" />
      </svg>
      Continue with Apple
    </button>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-fog/85">
      <span className="h-px flex-1 bg-edge" />
      or
      <span className="h-px flex-1 bg-edge" />
    </div>
  );
}

export function LoginForm({
  googleEnabled,
  appleEnabled = false,
  notice = null,
}: {
  googleEnabled: boolean;
  appleEnabled?: boolean;
  notice?: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUnverified(false);
    startTransition(async () => {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      }).catch(() => null);
      if (!res) {
        setError(REQUEST_FAILED);
      } else if (res.code === "email_not_verified") {
        setUnverified(true);
      } else if (res?.error) {
        setError("Incorrect email or password");
      } else {
        router.push("/");
        router.refresh();
      }
    });
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-edge bg-card p-6 shadow-xl">
      <h1 className="mb-4 text-lg font-semibold">Sign in</h1>
      {notice && (
        <p role="status" className="mb-4 rounded-md bg-mint/10 px-3 py-2 text-sm text-mint">
          {notice}
        </p>
      )}
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          name="email"
          id="login-email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          name="password"
          id="login-password"
          autoComplete="current-password"
          aria-label="Password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        {unverified && (
          <div role="alert" className="rounded-md bg-gold/10 px-3 py-2 text-sm text-gold">
            Please confirm your email first — check your inbox for our link.{" "}
            {resent ? (
              <span className="text-fog">Sent another one.</span>
            ) : (
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    const result = await safeAction(() => resendVerification(email));
                    if (result.ok) setResent(true);
                    else setError(result.error);
                  })
                }
                className="underline hover:text-white"
              >
                Resend link
              </button>
            )}
          </div>
        )}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-right text-sm">
          <Link href="/forgot-password" className="text-fog hover:text-white hover:underline">
            Forgot password?
          </Link>
        </p>
      </form>
      {(googleEnabled || appleEnabled) && (
        <div className="mt-4 space-y-3">
          <Divider />
          {googleEnabled && <GoogleButton />}
          {appleEnabled && <AppleButton />}
        </div>
      )}
      <p className="mt-5 text-sm text-fog">
        New here?{" "}
        <Link href="/register" className="text-mint hover:underline">
          Create an account
        </Link>
      </p>
      <p className="mt-2 text-sm text-fog">
        Trouble signing in?{" "}
        <Link href="/support" className="text-mint hover:underline">
          Get help
        </Link>
      </p>
    </div>
  );
}

// `invite` is a code for a reserved username (from /register?invite=…);
// the username is then fixed to the one it was issued for.
export function RegisterForm({
  googleEnabled,
  appleEnabled = false,
  invite,
}: {
  googleEnabled: boolean;
  appleEnabled?: boolean;
  invite?: { code: string; username: string } | null;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState(invite?.username ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() => registerUser({ name, username, email, password, invite: invite?.code }));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="w-full max-w-sm rounded-xl border border-edge bg-card p-6 shadow-xl">
        <h1 className="mb-2 text-lg font-semibold">Check your email</h1>
        <p className="text-sm text-fog">
          We&apos;ve sent a link to <span className="text-white">{email}</span>.
          Open it to confirm your address, then sign in.
        </p>
        <p className="mt-4 text-sm text-fog">
          Nothing arrived after a few minutes? Check spam, or{" "}
          <Link href="/login" className="text-mint hover:underline">
            sign in
          </Link>{" "}
          to resend it.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-edge bg-card p-6 shadow-xl">
      <h1 className="mb-4 text-lg font-semibold">Create your account</h1>
      {invite && (
        <p className="mb-4 rounded-md bg-mint/10 px-3 py-2 text-sm text-mint">
          You&apos;ve been invited — <span className="font-semibold">@{invite.username}</span> is saved for you.
        </p>
      )}
      <form onSubmit={submit} className="space-y-3">
        <input
          type="text"
          required
          name="name"
          id="register-name"
          maxLength={50}
          autoComplete="name"
          aria-label="Display name"
          placeholder="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <div>
          <input
            type="text"
            required
            name="handle"
            id="register-username"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            pattern="@?[A-Za-z0-9_]{3,20}"
            aria-label="Username"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            readOnly={Boolean(invite)}
            className={`${inputClass} read-only:opacity-70`}
          />
          <p className="mt-1 text-xs text-fog/85">
            Your public profile: beaten.games/{username.trim().replace(/^@/, "").toLowerCase() || "username"}
          </p>
        </div>
        <input
          type="email"
          required
          name="email"
          id="register-email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <NewPasswordField
          id="register-password"
          value={password}
          onChange={setPassword}
          className={inputClass}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
      {(googleEnabled || appleEnabled) && (
        <div className="mt-4 space-y-3">
          <Divider />
          {googleEnabled && <GoogleButton callbackUrl={invite ? `/settings?invite=${encodeURIComponent(invite.code)}` : "/"} />}
          {appleEnabled && <AppleButton callbackUrl={invite ? `/settings?invite=${encodeURIComponent(invite.code)}` : "/"} />}
        </div>
      )}
      <p className="mt-4 text-xs text-fog">
        By creating an account you agree to the{" "}
        <Link href="/terms" className="underline hover:text-white">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline hover:text-white">
          privacy policy
        </Link>
        .
      </p>
      <p className="mt-5 text-sm text-fog">
        Already have an account?{" "}
        <Link href="/login" className="text-mint hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
