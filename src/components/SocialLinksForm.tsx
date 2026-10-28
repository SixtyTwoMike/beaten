"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSocialLinks } from "@/app/actions/profile";
import { inputClass } from "./AuthForms";

export function SocialLinksForm({
  instagram,
  bluesky,
}: {
  instagram: string | null;
  bluesky: string | null;
}) {
  const router = useRouter();
  const [ig, setIg] = useState(instagram ?? "");
  const [bs, setBs] = useState(bluesky ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSocialLinks({ instagram: ig, bluesky: bs });
      if (!result.ok) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
  }

  const field = (
    id: string,
    label: string,
    prefix: string,
    value: string,
    set: (v: string) => void,
    placeholder: string
  ) => (
    <div>
      <label htmlFor={id} className="block text-sm text-fog">
        {label}
      </label>
      <div className="mt-1 flex items-center rounded-md border border-edge bg-canvas focus-within:border-mint/60 focus-within:ring-1 focus-within:ring-mint/40">
        <span className="pl-3 text-sm text-fog/70">{prefix}</span>
        <input
          id={id}
          value={value}
          onChange={(e) => set(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={200}
          className={`${inputClass} border-0 bg-transparent pl-1 focus:ring-0`}
        />
      </div>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      {field("social-instagram", "Instagram", "@", ig, setIg, "yourname")}
      {field("social-bluesky", "Bluesky", "@", bs, setBs, "yourname.bsky.social")}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50 transition"
        >
          {pending ? "Saving…" : "Save links"}
        </button>
        {saved && <p className="text-sm text-mint">Saved.</p>}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
