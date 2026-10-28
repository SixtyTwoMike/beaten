"use client";

import { useState } from "react";

// A review, blurred behind a tap when it's marked as containing spoilers.
export function ReviewText({ text, spoilers, className = "" }: { text: string; spoilers: boolean; className?: string }) {
  const [shown, setShown] = useState(!spoilers);
  if (shown) return <p className={`whitespace-pre-line break-words ${className}`}>{text}</p>;
  return (
    <button
      type="button"
      onClick={() => setShown(true)}
      className="group relative block w-full text-left"
      aria-label="Show review (contains spoilers)"
    >
      <p aria-hidden className={`line-clamp-3 select-none whitespace-pre-line break-words blur-sm ${className}`}>
        {text}
      </p>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="rounded-full bg-canvas/90 px-3 py-1 text-xs text-white group-hover:bg-card-2">
          Contains spoilers · show
        </span>
      </span>
    </button>
  );
}
