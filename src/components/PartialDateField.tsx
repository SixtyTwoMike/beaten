"use client";

// A date that can be a whole date, just a month, or just a year ("I started
// it sometime in 2026"). The value is "YYYY-MM-DD", "YYYY-MM", "YYYY" or ""
// (unset), which is what saveLog accepts.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MODES = [
  ["DAY", "Day"],
  ["MONTH", "Month"],
  ["YEAR", "Year"],
] as const;
type Mode = (typeof MODES)[number][0];

function modeOf(value: string): Mode {
  return value.length === 4 ? "YEAR" : value.length === 7 ? "MONTH" : "DAY";
}

export function PartialDateField({
  id,
  value,
  onChange,
  fieldClass,
  required = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  fieldClass: string;
  required?: boolean;
}) {
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const years = Array.from({ length: thisYear - 1970 + 1 }, (_, i) => String(thisYear - i));
  const mode = modeOf(value);
  const year = value.slice(0, 4);
  const month = value.slice(5, 7);

  // Switching keeps whatever parts are already set.
  function switchTo(next: Mode) {
    if (next === mode) return;
    const y = year || String(thisYear);
    const m = month || String(now.getUTCMonth() + 1).padStart(2, "0");
    onChange(next === "YEAR" ? y : next === "MONTH" ? `${y}-${m}` : `${y}-${m}-01`);
  }

  const select = `${fieldClass} min-w-0`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 text-xs" role="group" aria-label="How exact">
        {MODES.map(([m, label]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => switchTo(m)}
            className="rounded px-2 py-0.5 text-fog hover:text-white aria-pressed:bg-card-2 aria-pressed:text-white"
          >
            {label}
          </button>
        ))}
        {value && !required && (
          <button type="button" onClick={() => onChange("")} className="ml-auto px-1 text-fog hover:text-white">
            Clear
          </button>
        )}
      </div>
      {mode === "DAY" && (
        <input id={id} type="date" required={required} value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass} />
      )}
      {mode === "MONTH" && (
        <div className="flex gap-2">
          <select
            id={id}
            aria-label="Month"
            value={month}
            onChange={(e) => onChange(`${year || thisYear}-${e.target.value}`)}
            className={select}
          >
            {MONTHS.map((name, i) => (
              <option key={name} value={String(i + 1).padStart(2, "0")}>
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label="Year"
            value={year}
            onChange={(e) => onChange(`${e.target.value}-${month || "01"}`)}
            className={select}
          >
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </div>
      )}
      {mode === "YEAR" && (
        <select id={id} aria-label="Year" value={year} onChange={(e) => onChange(e.target.value)} className={select}>
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      )}
    </div>
  );
}
