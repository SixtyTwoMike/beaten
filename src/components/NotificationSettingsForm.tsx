"use client";

import { useState, useTransition } from "react";
import { saveNotificationSettings } from "@/app/actions/notifications";
import { safeAction } from "@/lib/safe-action";

// The email frequency for comments and for reactions; saves on change.
// (Options mirror FREQUENCIES in lib/notifications.ts.)
const OPTIONS = [
  ["instant", "As they happen"],
  ["daily", "Daily summary"],
  ["weekly", "Weekly summary"],
  ["off", "Off"],
] as const;

type Frequency = (typeof OPTIONS)[number][0];

export function NotificationSettingsForm({ comments, reactions }: { comments: Frequency; reactions: Frequency }) {
  const [values, setValues] = useState({ comments, reactions });
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(key: "comments" | "reactions", value: Frequency) {
    const before = values;
    setValues({ ...values, [key]: value });
    setStatus(null);
    startTransition(async () => {
      const result = await safeAction(() => saveNotificationSettings({ [key]: value }));
      if (result.ok) setStatus("Saved.");
      else {
        setValues(before);
        setStatus(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {(
        [
          ["comments", "Comments on your reviews"],
          ["reactions", "Reactions to your reviews"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>{label}</span>
          <select
            id={`notify-${key}`}
            value={values[key]}
            disabled={pending}
            onChange={(e) => change(key, e.target.value as Frequency)}
            className="rounded-md border border-edge bg-canvas px-2 py-1.5 text-sm outline-none focus:border-mint/60"
          >
            {OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      ))}
      {status && (
        <p role="status" className="text-xs text-fog">
          {status}
        </p>
      )}
    </div>
  );
}
