"use client";

/* eslint-disable @next/next/no-img-element -- console photos are static files */
import { useId, useMemo, useRef, useState } from "react";
import type { ConsoleOption } from "@/lib/chronicle-core";

// Type-to-search console picker (the full IGDB list is hundreds long). The
// list opens in the flow rather than floating, so it can't be clipped by
// the scrolling dialog it sits in.
// Empty: the popular consoles, best-sellers first. Typing matches name, abbreviation and other
// names ("genesis", "ps2", "snes"), whole-word matches first.

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

function rank(option: ConsoleOption, words: string[]): number | null {
  const name = norm(option.name);
  const hay = `${name} ${norm(option.search)}`;
  if (!words.every((w) => hay.includes(w))) return null;
  const q = words.join(" ");
  if (name === q || norm(option.search).split(" ").includes(q)) return 0;
  if (name.startsWith(q)) return 1;
  if (words.every((w) => ` ${hay}`.includes(` ${w}`))) return 2;
  return 3;
}

export function ConsolePicker({
  id,
  options,
  value,
  onChange,
  className,
}: {
  id: string;
  options: ConsoleOption[];
  value: string;
  onChange: (value: string) => void;
  className: string;
}) {
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? null;
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const words = norm(selected && query === selected.name ? "" : query).split(" ").filter(Boolean);
    if (words.length === 0) {
      return options.filter((o) => o.popular).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    }
    return options
      .map((o) => ({ o, r: rank(o, words) }))
      .filter((x): x is { o: ConsoleOption; r: number } => x.r !== null)
      .sort((a, b) => a.r - b.r || Number(b.o.popular) - Number(a.o.popular) || a.o.name.localeCompare(b.o.name))
      .slice(0, 30)
      .map((x) => x.o);
  }, [options, query, selected]);

  function choose(o: ConsoleOption) {
    onChange(o.value);
    setQuery(o.name);
    setOpen(false);
  }

  function move(delta: number) {
    setOpen(true);
    setActive((i) => {
      const next = Math.max(0, Math.min(matches.length - 1, i + delta));
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
      return next;
    });
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        {selected?.thumb && (
          <img src={selected.thumb} alt="" className="h-9 w-12 shrink-0 object-contain" />
        )}
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search consoles & computers…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
            if (selected) onChange("");
          }}
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              move(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              move(-1);
            } else if (e.key === "Enter" && open && matches[active]) {
              e.preventDefault();
              choose(matches[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className={className}
        />
      </div>
      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-edge bg-card-2 py-1 shadow-xl"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-fog">No consoles match “{query}”</li>
          ) : (
            matches.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm ${i === active ? "bg-card text-white" : "text-fog"}`}
              >
                <span className="flex h-7 w-10 shrink-0 items-center justify-center">
                  {o.thumb && <img src={o.thumb} alt="" className="max-h-full max-w-full object-contain" />}
                </span>
                {o.name}
              </li>
            ))
          )}
          {!query.trim() && matches.length > 0 && (
            <li className="border-t border-edge px-3 py-1.5 text-xs text-fog/85">Popular consoles — type to search them all</li>
          )}
        </ul>
      )}
    </div>
  );
}
