const STAR_PATH =
  "M12 2l2.92 6.26 6.87.83-5.07 4.71 1.33 6.79L12 17.27l-6.05 3.32 1.33-6.79-5.07-4.71 6.87-.83L12 2z";

export function StarIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d={STAR_PATH} />
    </svg>
  );
}

function StarRow({ className }: { className: string }) {
  return (
    <span className={`flex ${className}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <StarIcon key={i} className="h-4 w-4 shrink-0" />
      ))}
    </span>
  );
}

// Read-only display of a 1-10 rating as 5 stars with half-star precision.
export function Stars({ rating }: { rating: number }) {
  const pct = Math.max(0, Math.min(100, rating * 10));
  return (
    <span className="relative inline-block align-middle">
      <StarRow className="text-edge" />
      <span
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${pct}%` }}
      >
        <StarRow className="text-gold" />
      </span>
    </span>
  );
}
