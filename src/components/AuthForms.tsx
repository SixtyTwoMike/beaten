"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerUser } from "@/app/actions/auth";

const inputClass =
  "w-full rounded-md border border-edge bg-canvas px-3 py-2 text-sm outline-none placeholder:text-fog/60 focus:border-mint/60 focus:ring-1 focus:ring-mint/40";

const buttonClass =
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

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
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
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
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
    </div>
  );
}

export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const passwordTooShort = password.length > 0 && password.length < 8;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await registerUser({ name, email, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        router.push("/login");
      } else {
        router.push("/");
        router.refresh();
      }
    });
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-edge bg-card p-6 shadow-xl">
      <h1 className="mb-4 text-lg font-semibold">Create your account</h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="text"
          required
          autoComplete="name"
          placeholder="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <div>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          {passwordTooShort && (
            <p className="mt-1 text-xs text-gold">
              At least 8 characters required
            </p>
          )}
        </div>
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
