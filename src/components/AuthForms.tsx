"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resendVerification } from "@/app/actions/account";
import { registerUser } from "@/app/actions/auth";
import { NewPasswordField } from "./NewPasswordField";

export const inputClass =
  "w-full rounded-md border border-edge bg-canvas px-3 py-2 text-sm outline-none placeholder:text-fog/60 focus:border-mint/60 focus:ring-1 focus:ring-mint/40";

export const buttonClass =
  "w-full rounded-md bg-mint px-3 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition";

function GoogleButton() {
  return (
    <button
      type="button"
      onClick={() => signIn("google", { callbackUrl: "/" })}
      className="w-full rounded-md border border-edge bg-card-2 px-3 py-2 text-sm font-medium hover:border-fog/50 transition"
    >
      Continue with Google
    </button>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-fog/70">
      <span className="h-px flex-1 bg-edge" />
      or
      <span className="h-px flex-1 bg-edge" />
    </div>
  );
}

export function LoginForm({
  googleEnabled,
  notice = null,
}: {
  googleEnabled: boolean;
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
      });
      if (res?.code === "email_not_verified") {
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
                    await resendVerification(email);
                    setResent(true);
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
      {googleEnabled && (
        <div className="mt-4 space-y-4">
          <Divider />
          <GoogleButton />
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

export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await registerUser({ name, username, email, password });
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
      <form onSubmit={submit} className="space-y-3">
        <input
          type="text"
          required
          name="name"
          id="register-name"
          maxLength={50}
          autoComplete="name"
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
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-fog/70">
            Your public profile: /u/{username.trim().replace(/^@/, "").toLowerCase() || "username"}
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
      {googleEnabled && (
        <div className="mt-4 space-y-4">
          <Divider />
          <GoogleButton />
        </div>
      )}
      <p className="mt-5 text-sm text-fog">
        Already have an account?{" "}
        <Link href="/login" className="text-mint hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
