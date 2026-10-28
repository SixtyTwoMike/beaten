import type { DatePrecision } from "./format";

// Parsing dates people type or pick: full days, or just a month or a year.

// Strictly YYYY-MM-DD; rejects expanded years ("+202600-01-01") and
// rollovers like 2026-02-31.
export function parseDate(value: string | null | undefined): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

// A date given as just "YYYY-MM" or "YYYY": the first day of that period,
// and how precise it is.
export function parsePartialDate(value: string | null | undefined): { date: Date; precision: DatePrecision } | null {
  if (typeof value !== "string") return null;
  if (/^\d{4}$/.test(value)) {
    const date = parseDate(`${value}-01-01`);
    return date ? { date, precision: "YEAR" } : null;
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    const date = parseDate(`${value}-01`);
    return date ? { date, precision: "MONTH" } : null;
  }
  const date = parseDate(value);
  return date ? { date, precision: "DAY" } : null;
}

// The last day of a partial date's period, for "start before end" checks:
// a game started in March 2026 can be finished "in 2026".
export function periodEnd(d: { date: Date; precision: DatePrecision }): Date {
  const y = d.date.getUTCFullYear();
  const m = d.date.getUTCMonth();
  if (d.precision === "YEAR") return new Date(Date.UTC(y, 11, 31));
  if (d.precision === "MONTH") return new Date(Date.UTC(y, m + 1, 0));
  return d.date;
}
