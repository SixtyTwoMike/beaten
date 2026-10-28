import Link from "next/link";

// Wordmark: white Futura caps, widely tracked. Futura ships on Apple devices;
// elsewhere it falls back to the closest geometric sans available.
export function Logo({
  href,
  className = "text-xl",
}: {
  href?: string;
  className?: string;
}) {
  const mark = (
    <span
      className={`font-medium uppercase tracking-[0.15em] text-white ${className}`}
      style={{ fontFamily: 'Futura, "Futura PT", "Century Gothic", "Trebuchet MS", sans-serif' }}
    >
      Beaten
    </span>
  );
  return href ? <Link href={href}>{mark}</Link> : mark;
}
