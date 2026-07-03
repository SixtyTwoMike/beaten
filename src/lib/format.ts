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
