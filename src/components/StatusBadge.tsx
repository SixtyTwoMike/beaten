export function StatusBadge({ status }: { status: string }) {
  if (status === "MASTERED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold">
        ★ Mastered
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-mint/15 px-2 py-0.5 text-xs font-semibold text-mint">
      ✓ Beaten
    </span>
  );
}
