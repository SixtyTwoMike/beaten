"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCollectionSettings } from "@/app/actions/collection";
import { safeAction } from "@/lib/safe-action";

// Turn the collection on or off, and whether it shows on the profile.
export function CollectionSettingsForm({ enabled, public: shown }: { enabled: boolean; public: boolean }) {
  const router = useRouter();
  // Shown at once; put back if saving fails.
  const [isPublic, setIsPublic] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(input: { enabled?: boolean; public?: boolean }) {
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() => saveCollectionSettings(input));
      if (!result.ok) {
        if (input.public !== undefined) setIsPublic(!input.public);
        return setError(result.error);
      }
      router.refresh();
    });
  }

  if (!enabled) {
    return (
      <div>
        <button
          type="button"
          disabled={pending}
          onClick={() => save({ enabled: true })}
          className="rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-60"
        >
          Start my collection
        </button>
        {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 accent-mint"
          checked={isPublic}
          disabled={pending}
          onChange={(e) => {
            setIsPublic(e.target.checked);
            save({ public: e.target.checked });
          }}
        />
        <span>
          Show my collection on my profile
          <span className="block text-xs text-fog">Games, platforms, region and box only. What you paid and your notes stay private.</span>
        </span>
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={() => save({ enabled: false })}
        className="rounded-md border border-edge px-3 py-1.5 text-fog hover:border-fog/50 hover:text-white"
      >
        Turn off Collection
      </button>
      <p className="text-xs text-fog/80">Turning it off hides it everywhere; your games are kept if you turn it back on.</p>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
