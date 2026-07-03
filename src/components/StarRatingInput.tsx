"use client";

import { useState } from "react";
import { StarIcon } from "./Stars";

// Interactive 5-star rating with half-star steps. Value is 0 (unrated) to 10.
export function StarRatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex"
        onMouseLeave={() => setHover(0)}
        role="radiogroup"
        aria-label="Star rating"
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = Math.max(0, Math.min(2, shown - (star - 1) * 2));
          return (
            <span key={star} className="relative h-7 w-7">
              <StarIcon className="absolute inset-0 h-7 w-7 text-edge" />
              <span
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${(fill / 2) * 100}%` }}
              >
                <StarIcon className="h-7 w-7 text-gold" />
              </span>
              <button
                type="button"
                role="radio"
                aria-checked={value === star * 2 - 1}
                aria-label={`${star - 0.5} stars`}
                className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
                onMouseEnter={() => setHover(star * 2 - 1)}
                onClick={() => onChange(star * 2 - 1)}
              />
              <button
                type="button"
                role="radio"
                aria-checked={value === star * 2}
                aria-label={`${star} stars`}
                className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
                onMouseEnter={() => setHover(star * 2)}
                onClick={() => onChange(star * 2)}
              />
            </span>
          );
        })}
      </div>
      <span className="w-8 text-sm text-fog tabular-nums">
        {shown ? (shown / 2).toFixed(1) : "—"}
      </span>
      {value > 0 && (
        <button
          type="button"
          onClick={() => onChange(0)}
          className="text-xs text-fog hover:text-white underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
