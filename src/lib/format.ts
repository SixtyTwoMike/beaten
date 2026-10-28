export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Date -> YYYY-MM-DD (UTC), for <input type="date"> values.
export function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

// rating is 1-10 half-star steps; returns e.g. "3.5"
export function ratingToStars(rating: number): string {
  return (rating / 2).toFixed(rating % 2 === 0 ? 0 : 1);
}

// One-line dates for a log entry: "Jan 2, 2026 – Feb 3, 2026", "Playing
// since …", "Shelved Mar 4, 2026", or "Finished, date unknown" for games
// beaten long ago.
export function logDates(log: {
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  stoppedAt?: Date | null;
}): string {
  if (log.status === "SHELVED") {
    if (log.stoppedAt) {
      return `${log.startedAt ? `${formatDate(log.startedAt)} – ` : "Shelved "}${formatDate(log.stoppedAt)}`;
    }
    return log.startedAt ? `Started ${formatDate(log.startedAt)}` : "Shelved";
  }
  if (log.finishedAt) {
    return `${log.startedAt ? `${formatDate(log.startedAt)} – ` : ""}${formatDate(log.finishedAt)}`;
  }
  if (log.status !== "PLAYING") return "Finished, date unknown";
  return log.startedAt ? `Playing since ${formatDate(log.startedAt)}` : "Currently playing";
}
