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

// Start and put-down dates may be just a month or a year ("I started it in
// March"). Stored as the first day of that period plus a precision.
export type DatePrecision = "DAY" | "MONTH" | "YEAR";

export function precisionOf(value: string | null | undefined): DatePrecision {
  return value === "MONTH" || value === "YEAR" ? value : "DAY";
}

// "YYYY", "YYYY-MM" or "YYYY-MM-DD" for the date field and exports.
export function toPartialInput(d: Date | null | undefined, precision: string | null | undefined): string {
  if (!d) return "";
  const full = toDateInput(d);
  const p = precisionOf(precision);
  return p === "YEAR" ? full.slice(0, 4) : p === "MONTH" ? full.slice(0, 7) : full;
}

// "Mar 4, 2026", "Mar 2026" or "2026".
export function formatPartialDate(d: Date | null | undefined, precision: string | null | undefined): string {
  if (!d) return "";
  const p = precisionOf(precision);
  if (p === "YEAR") return String(d.getUTCFullYear());
  if (p === "MONTH") return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  return formatDate(d);
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
  startedPrecision?: string | null;
  finishedAt: Date | null;
  finishedPrecision?: string | null;
  stoppedAt?: Date | null;
  stoppedPrecision?: string | null;
}): string {
  const started = formatPartialDate(log.startedAt, log.startedPrecision);
  if (log.status === "SHELVED") {
    if (log.stoppedAt) {
      return `${started ? `${started} – ` : "Shelved "}${formatPartialDate(log.stoppedAt, log.stoppedPrecision)}`;
    }
    return started ? `Started ${started}` : "Shelved";
  }
  if (log.finishedAt) {
    return `${started ? `${started} – ` : ""}${formatPartialDate(log.finishedAt, log.finishedPrecision)}`;
  }
  if (log.status !== "PLAYING") return "Finished, date unknown";
  return started ? `Playing since ${started}` : "Currently playing";
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "4 January" or "January", from a partial date ("2026-01-04", "2026-01").
export function dayMonth(partial: string) {
  const month = MONTHS[Number(partial.slice(5, 7)) - 1] ?? "";
  return partial.length >= 10 ? `${Number(partial.slice(8, 10))} ${month}` : month;
}

// "just now", "5m", "3h", "2d", then the date.
export function timeAgo(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const s = (Date.now() - date.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
