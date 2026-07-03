// Game cover, with a deterministic gradient placeholder when no cover exists
// (the built-in mock catalog has no cover art).

const HUES = [210, 265, 330, 20, 150, 45, 190, 300];

function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return HUES[Math.abs(h) % HUES.length];
}

export function Poster({
  name,
  coverUrl,
  className = "",
}: {
  name: string;
  coverUrl: string | null;
  className?: string;
}) {
  if (coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverUrl}
        alt={`Cover of ${name}`}
        className={`aspect-[3/4] w-full rounded-md object-cover ${className}`}
      />
    );
  }
  const hue = hashHue(name);
  return (
    <div
      role="img"
      aria-label={`Cover of ${name}`}
      className={`aspect-[3/4] w-full rounded-md p-2 flex items-end overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 45% 28%), hsl(${
          (hue + 40) % 360
        } 50% 14%))`,
      }}
    >
      <span className="text-xs font-semibold leading-tight text-white/90 line-clamp-4">
        {name}
      </span>
    </div>
  );
}
