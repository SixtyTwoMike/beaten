"use client";

/* eslint-disable @next/next/no-img-element -- console photos are static files */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteChronicleEntry, saveChronicleEntry, saveChronicleSettings } from "@/app/actions/chronicle";
import type { ActionResult } from "@/app/actions/logs";
import {
  CHRONICLE_BACKGROUNDS,
  CHRONICLE_PATHS,
  DEFAULT_TITLE,
  MAX_MODEL,
  MAX_NOTE,
  MAX_TITLE,
  type ChronicleBackground,
  type ChroniclePath,
  type ChronicleStop,
  type ChronicleView,
  type ConsoleOption,
} from "@/lib/chronicle-core";
import { safeAction } from "@/lib/safe-action";
import { CARD_ACCENTS, type CardAccent } from "@/lib/share-card";
import { ChronicleMap } from "./ChronicleMap";
import { ConsolePicker } from "./ConsolePicker";
import { PartialDateField } from "./PartialDateField";
import { Poster } from "./Poster";

export type SuggestedGame = { igdbId: number; name: string; coverUrl: string | null };

export type EntryInput = {
  id?: string | null;
  platformId: number;
  variant: string | null;
  model: string;
  gotAt: string;
  age: number | null;
  note: string;
  games: SuggestedGame[];
};

export type SettingsInput = {
  title: string;
  name: string;
  birthYear: number | null;
  showAges: boolean;
  accent: CardAccent;
  background: ChronicleBackground;
  path: ChroniclePath;
};

// Where the editor saves: the account (server actions) or, for guests, this
// browser (components/GuestChronicle). Each refreshes `view` once saved.
export type ChronicleStore = {
  saveSettings: (s: SettingsInput) => Promise<ActionResult>;
  saveEntry: (e: EntryInput) => Promise<ActionResult>;
  deleteEntry: (id: string) => Promise<ActionResult>;
};

function useAccountStore(): ChronicleStore {
  const router = useRouter();
  return useMemo(() => {
    const refreshing = async (r: Promise<ActionResult>) => {
      const result = await r;
      if (result.ok) router.refresh();
      return result;
    };
    return {
      // The name comes from the account; only guests type one.
      saveSettings: (s) =>
        refreshing(
          saveChronicleSettings({ title: s.title, birthYear: s.birthYear, showAges: s.showAges, accent: s.accent, background: s.background, path: s.path })
        ),
      saveEntry: ({ games, ...e }) => refreshing(saveChronicleEntry({ ...e, games: games.map((g) => g.igdbId) })),
      deleteEntry: (id) => refreshing(deleteChronicleEntry(id)),
    };
  }, [router]);
}

const field =
  "w-full rounded-md border border-edge bg-canvas px-3 py-2 text-sm outline-none placeholder:text-fog/70 focus:border-mint/60 focus:ring-1 focus:ring-mint/40";
const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-fog";
const chip =
  "rounded-full border border-edge px-3 py-1 text-xs text-fog aria-pressed:border-mint/60 aria-pressed:bg-mint/10 aria-pressed:text-white";
const primary =
  "rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50 transition";
const quiet =
  "rounded-md border border-edge px-3 py-2 text-sm text-fog hover:border-fog/50 hover:text-white disabled:opacity-50 transition";

type Settings = {
  title: string;
  name: string;
  birthYear: string;
  showAges: boolean;
  accent: CardAccent;
  background: ChronicleBackground;
  path: ChroniclePath;
};

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-edge bg-card p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

// The three favourite slots. Tapping an empty one opens a search right
// under them (scrolled to the top of the dialog, so the keyboard can't hide
// it) that searches as you type, with this console's diary games below.
function GamePicker({
  platformId,
  picked,
  onChange,
  suggestions,
}: {
  platformId: number | null;
  picked: SuggestedGame[];
  onChange: (games: SuggestedGame[]) => void;
  suggestions: { byPlatform: Record<number, SuggestedGame[]> };
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SuggestedGame[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const full = picked.length >= 3;
  const notPicked = (g: SuggestedGame) => !picked.some((p) => p.igdbId === g.igdbId);
  const fromDiary = (platformId != null ? suggestions.byPlatform[platformId] ?? [] : []).filter(notPicked);

  // Search as you type, a moment after the last key.
  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q: term });
        if (platformId) params.set("platform", String(platformId));
        const res = await fetch(`/api/igdb/search?${params}`);
        const data = (await res.json()) as { results?: SuggestedGame[]; error?: string };
        if (!res.ok) throw new Error(res.status === 429 ? data.error : undefined);
        if (!cancelled) setResults((data.results ?? []).slice(0, 10).map((g) => ({ igdbId: g.igdbId, name: g.name, coverUrl: g.coverUrl })));
      } catch (e) {
        if (!cancelled) setError((e instanceof Error && e.message) || "Search failed — try again");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, open, platformId]);

  // Once open: focus the box and bring the slots and search to the top of
  // the dialog.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });
    rootRef.current?.scrollIntoView({ block: "start" });
  }, [open]);

  function add(g: SuggestedGame) {
    if (full) return;
    const next = [...picked, g];
    onChange(next);
    setQ("");
    setResults(null);
    if (next.length >= 3) setOpen(false);
    else inputRef.current?.focus({ preventScroll: true });
  }

  const tile = (g: SuggestedGame) => (
    <li key={g.igdbId}>
      <button type="button" onClick={() => add(g)} title={`Add ${g.name}`} className="block w-full hover:opacity-80">
        <Poster name={g.name} coverUrl={g.coverUrl} />
        <span className="mt-1 block truncate text-[11px] text-fog">{g.name}</span>
      </button>
    </li>
  );
  const shown = q.trim().length >= 2 ? (results ?? []).filter(notPicked) : [];

  return (
    <div ref={rootRef} className="scroll-mt-3 space-y-3">
      <ul className="grid max-w-[15rem] grid-cols-3 gap-2">
        {[0, 1, 2].map((i) =>
          picked[i] ? (
            <li key={picked[i].igdbId} className="relative">
              <Poster name={picked[i].name} coverUrl={picked[i].coverUrl} />
              <button
                type="button"
                onClick={() => onChange(picked.filter((_, j) => j !== i))}
                aria-label={`Remove ${picked[i].name}`}
                className="absolute right-1 top-1 rounded-full bg-canvas/90 px-1.5 text-xs text-white"
              >
                ✕
              </button>
            </li>
          ) : (
            <li key={`empty-${i}`}>
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={`Choose game ${i + 1}`}
                className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-edge text-fog transition hover:border-mint/60 hover:text-white"
              >
                <span className="text-xl leading-none">+</span>
                <span className="text-xs">#{i + 1}</span>
              </button>
            </li>
          )
        )}
      </ul>

      {open && !full && (
        // Tall enough to scroll to the top of the dialog even with no results yet.
        <div className="min-h-[60dvh] space-y-3 rounded-lg border border-edge bg-canvas p-3 sm:min-h-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              placeholder="Search for a game"
              aria-label="Search for a game"
              enterKeyHint="search"
              className={field}
            />
            <button type="button" onClick={() => setOpen(false)} className={quiet}>
              Done
            </button>
          </div>
          {busy && <p className="text-xs text-fog">Searching…</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {!busy && q.trim().length >= 2 && results && shown.length === 0 && <p className="text-xs text-fog">No games found.</p>}
          {shown.length > 0 && <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">{shown.map(tile)}</ul>}
          {fromDiary.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-fog">From your diary</p>
              <ul className="grid grid-cols-5 gap-2 sm:grid-cols-6">{fromDiary.slice(0, 10).map(tile)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EntryForm({
  stop,
  consoles,
  suggestions,
  birthYear,
  store,
  onDone,
}: {
  stop: ChronicleStop | null;
  consoles: ConsoleOption[];
  suggestions: { byPlatform: Record<number, SuggestedGame[]> };
  birthYear: number | null;
  store: ChronicleStore;
  onDone: () => void;
}) {
  const thisYear = String(new Date().getUTCFullYear());
  // "<platformId>" or "<platformId>:<variant>", as ConsoleOption.value.
  const [choice, setChoice] = useState<string>(stop ? `${stop.platformId}${stop.variant ? `:${stop.variant}` : ""}` : "");
  const [platformPart, variantPart] = choice.split(":");
  const platformId = platformPart || "";
  const [model, setModel] = useState(stop?.model ?? "");
  const [gotAt, setGotAt] = useState(stop?.gotAt ?? thisYear);
  const [age, setAge] = useState(stop?.ageTyped != null ? String(stop.ageTyped) : "");
  const [note, setNote] = useState(stop?.note ?? "");
  const [games, setGames] = useState<SuggestedGame[]>(stop?.games ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const autoAge = birthYear && gotAt ? Number(gotAt.slice(0, 4)) - birthYear : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() =>
        store.saveEntry({
          id: stop?.id,
          platformId: Number(platformId),
          variant: variantPart ?? null,
          model,
          gotAt,
          age: age.trim() ? Number(age) : null,
          note,
          games,
        })
      );
      if (!result.ok) return setError(result.error);
      onDone();
    });
  }

  const dialogRef = useRef<HTMLDivElement>(null);
  // Focus in on open, back out on close; Escape closes; the page behind
  // doesn't scroll.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("input")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  const title = stop ? `Edit ${stop.platformName}` : "Add a console";
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onDone()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => e.key === "Escape" && onDone()}
        className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-edge bg-card shadow-2xl sm:max-h-[88vh] sm:max-w-lg sm:rounded-2xl"
      >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-edge px-4 py-3">
            <h3 className="font-semibold">{title}</h3>
            <button type="button" onClick={onDone} aria-label="Close" className="rounded-md p-1.5 text-fog hover:bg-card-2 hover:text-white">
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div>
              <label className={label} htmlFor="chronicle-console">Console or computer</label>
              <ConsolePicker id="chronicle-console" options={consoles} value={choice} onChange={setChoice} className={`${field} min-w-0`} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <span className={label}>When you got it</span>
                <PartialDateField id="chronicle-got" required value={gotAt} onChange={setGotAt} fieldClass={field} />
              </div>
              <div className="min-w-0">
                <label className={label} htmlFor="chronicle-age">
                  Your age then <span className="normal-case text-fog/85">(optional)</span>
                </label>
                <input
                  id="chronicle-age"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder={autoAge != null && autoAge >= 0 ? `About ${autoAge}` : "e.g. 9"}
                  className={field}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="chronicle-model">
                  Model <span className="normal-case text-fog/85">(optional)</span>
                </label>
                <input id="chronicle-model" value={model} maxLength={MAX_MODEL} onChange={(e) => setModel(e.target.value)} placeholder="Slim, Lite, special edition…" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="chronicle-note">
                  Note <span className="normal-case text-fog/85">(optional)</span>
                </label>
                <input id="chronicle-note" value={note} maxLength={MAX_NOTE} onChange={(e) => setNote(e.target.value)} placeholder="Christmas 1998, from Gran" className={field} />
              </div>
            </div>
            <div>
              <span className={label}>
                Top 3 games on it <span className="normal-case text-fog/85">(optional)</span>
              </span>
              <GamePicker platformId={platformId ? Number(platformId) : null} picked={games} onChange={setGames} suggestions={suggestions} />
            </div>
          </div>
          <div className="border-t border-edge px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {error && <p role="alert" className="mb-2 text-sm text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={pending || !platformId} className={`${primary} flex-1 sm:flex-none`}>
                {pending ? "Saving…" : stop ? "Save changes" : "Add to timeline"}
              </button>
              <button type="button" onClick={onDone} className={quiet}>Cancel</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Instagram story video, made on this device (lib/chronicle-video): render,
// then a second tap hands it to the share sheet (iPhone won't share after
// a long wait without a fresh tap), or downloads it where sharing files
// isn't supported. Keyed by the chronicle's version, so edits start afresh.
const VIDEO_SIZES = {
  full: "Instagram (best quality)",
  small: "Discord & WhatsApp (under 10MB)",
} as const;

function VideoShare({ view }: { view: ChronicleView }) {
  const [size, setSize] = useState<keyof typeof VIDEO_SIZES>("full");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  const canShare = file != null && typeof navigator !== "undefined" && Boolean(navigator.canShare?.({ files: [file] }));

  async function make() {
    setError(null);
    setProgress(0);
    try {
      const { renderChronicleVideo } = await import("@/lib/chronicle-video");
      setFile(await renderChronicleVideo(view, size, setProgress));
    } catch (e) {
      console.error("chronicle video failed:", e);
      setError("Couldn't make the video on this device — try again");
    } finally {
      setProgress(null);
    }
  }

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: "My Console Chronicles" });
    } catch {
      // Cancelled.
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-fog">A story-sized video that travels down your road, console by console.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Video size">
        {(Object.keys(VIDEO_SIZES) as (keyof typeof VIDEO_SIZES)[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={size === k}
            disabled={progress != null}
            onClick={() => {
              setSize(k);
              setFile(null);
            }}
            className={chip}
          >
            {VIDEO_SIZES[k]}
          </button>
        ))}
      </div>
      {progress != null ? (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-card-2">
            <div className="h-full bg-mint transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-fog">Making your video… {Math.round(progress * 100)}%</p>
        </div>
      ) : !file ? (
        <button type="button" onClick={make} className={primary}>Make story video</button>
      ) : (
        <div className="space-y-3">
          <video src={url!} controls playsInline muted loop className="max-h-96 w-auto rounded-lg border border-edge" />
          <p className="text-xs text-fog">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          <div className="flex flex-wrap gap-2">
            {canShare ? (
              <button type="button" onClick={share} className={primary}>Share video</button>
            ) : (
              <a href={url!} download={file.name} className={primary}>Download video</a>
            )}
            <button type="button" onClick={make} className={quiet}>Make again</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// `guest`: no account; `store` saves to this browser, and the Share panel
// offers the video plus an invitation to sign up.
export function ChronicleEditor({
  view,
  consoles,
  suggestions,
  store: guestStore,
  guest = false,
}: {
  view: ChronicleView;
  consoles: ConsoleOption[];
  suggestions: { byPlatform: Record<number, SuggestedGame[]> };
  store?: ChronicleStore;
  guest?: boolean;
}) {
  const accountStore = useAccountStore();
  const store = guestStore ?? accountStore;
  const [settings, setSettings] = useState<Settings>({
    title: view.title === DEFAULT_TITLE ? "" : view.title,
    name: guest && view.name !== "Me" ? view.name : "",
    birthYear: view.birthYear ? String(view.birthYear) : "",
    showAges: view.showAges,
    accent: view.accent,
    background: view.background,
    path: view.path,
  });
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | string>("idle");
  const [, startTransition] = useTransition();
  const first = useRef(true);

  // Look and details save themselves a moment after the last change.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      setSaveState("saving");
      startTransition(async () => {
        const birthYear = settings.birthYear.trim() ? Number(settings.birthYear) : null;
        const result = await safeAction(() => store.saveSettings({ ...settings, birthYear }));
        setSaveState(result.ok ? "saved" : result.error);
      });
    }, 700);
    return () => clearTimeout(t);
  }, [settings, store]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  // The preview reflects unsaved choices straight away.
  const birthYear = /^\d{4}$/.test(settings.birthYear) ? Number(settings.birthYear) : null;
  const preview: ChronicleView = {
    ...view,
    title: settings.title.trim() || DEFAULT_TITLE,
    name: guest ? settings.name.trim() || "Me" : view.name,
    showAges: settings.showAges,
    accent: settings.accent,
    accentHex: CARD_ACCENTS[settings.accent],
    background: settings.background,
    path: settings.path,
    birthYear,
    stops: view.stops.map((s) => ({ ...s, age: s.ageTyped ?? (birthYear ? Math.max(0, s.year - birthYear) : null) })),
  };
  // Changes whenever anything drawn on the story does, so it's re-made.
  const version = hash(JSON.stringify([view.stops, settings]));

  function remove(id: string) {
    startTransition(async () => {
      await safeAction(() => store.deleteEntry(id));
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Console Chronicles</h1>
          <p className="mt-1 text-sm text-fog">Every console you&apos;ve owned, in the order you got them.</p>
        </div>

        <Panel title="Consoles">
          {view.stops.length > 0 && (
            <ul className="mb-3 divide-y divide-edge">
              {view.stops.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <div className="flex h-10 w-14 shrink-0 items-center justify-center">
                    {s.art && <img src={s.art.src} alt="" className="max-h-full max-w-full object-contain" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.platformName}</p>
                    <p className="text-xs text-fog">
                      {s.gotLabel}
                      {s.games.length > 0 && ` · ${s.games.length} game${s.games.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <button type="button" onClick={() => setEditing(s.id)} className="text-xs text-fog hover:text-white">Edit</button>
                  <button type="button" onClick={() => remove(s.id)} className="text-xs text-fog hover:text-red-400">Remove</button>
                </li>
              ))}
            </ul>
          )}
          {editing ? (
            <EntryForm
              key={editing}
              stop={view.stops.find((s) => s.id === editing) ?? null}
              consoles={consoles}
              suggestions={suggestions}
              birthYear={birthYear}
              store={store}
              onDone={() => setEditing(null)}
            />
          ) : (
            <button type="button" onClick={() => setEditing("new")} className={primary}>+ Add a console</button>
          )}
        </Panel>

        <Panel title="Details">
          <div className="space-y-3">
            {guest && (
              <div>
                <label className={label} htmlFor="chronicle-name">Your name</label>
                <input
                  id="chronicle-name"
                  value={settings.name}
                  maxLength={40}
                  autoComplete="off"
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Shown under the title"
                  className={field}
                />
              </div>
            )}
            <div>
              <label className={label} htmlFor="chronicle-title">Title</label>
              <input id="chronicle-title" value={settings.title} maxLength={MAX_TITLE} onChange={(e) => set("title", e.target.value)} placeholder={DEFAULT_TITLE} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="chronicle-birth">
                Year you were born <span className="normal-case text-fog/85">(optional)</span>
              </label>
              <input
                id="chronicle-birth"
                inputMode="numeric"
                value={settings.birthYear}
                onChange={(e) => set("birthYear", e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="e.g. 1990"
                className={field}
              />
              <p className="mt-1 text-xs text-fog">Only used to work out how old you were. It&apos;s never shown.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-fog">
              <input type="checkbox" checked={settings.showAges} onChange={(e) => set("showAges", e.target.checked)} className="accent-[var(--color-mint)]" />
              Show ages on the map
            </label>
          </div>
        </Panel>

        <Panel title="Look">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Colour">
              {(Object.keys(CARD_ACCENTS) as CardAccent[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={settings.accent === a}
                  aria-label={a}
                  onClick={() => set("accent", a)}
                  className="h-7 w-7 rounded-full border-2 border-transparent aria-pressed:border-white"
                  style={{ backgroundColor: CARD_ACCENTS[a] }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Background">
              {(Object.keys(CHRONICLE_BACKGROUNDS) as ChronicleBackground[]).map((b) => (
                <button key={b} type="button" aria-pressed={settings.background === b} onClick={() => set("background", b)} className={chip}>
                  {CHRONICLE_BACKGROUNDS[b]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Road">
              {(Object.keys(CHRONICLE_PATHS) as ChroniclePath[]).map((p) => (
                <button key={p} type="button" aria-pressed={settings.path === p} onClick={() => set("path", p)} className={chip}>
                  {CHRONICLE_PATHS[p]}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Share">
          {guest ? (
            <div className="space-y-4">
              {view.stops.length > 0 ? (
                <VideoShare key={version} view={preview} />
              ) : (
                <p className="text-sm text-fog">Add a console to make a story video.</p>
              )}
              <p className="text-sm text-fog">
                Want a link to share too?{" "}
                <Link href="/register?from=chronicles" className="text-mint hover:underline">
                  Make a free account
                </Link>{" "}
                and your chronicle comes with you.
              </p>
            </div>
          ) : view.username ? (
            <div className="space-y-4">
              <p className="text-sm">
                <Link href={`/${view.username}/chronicles`} className="text-mint hover:underline">
                  beaten.games/{view.username}/chronicles
                </Link>
              </p>
              {view.stops.length > 0 && <VideoShare key={version} view={preview} />}
            </div>
          ) : (
            <p className="text-sm text-fog">
              Choose a username in <Link href="/settings" className="text-mint hover:underline">Settings</Link> to share your chronicle.
            </p>
          )}
        </Panel>
        <p className="h-4 text-xs text-fog" aria-live="polite">
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState !== "idle" ? saveState : ""}
        </p>
      </div>

      <div className="min-w-0">
        <ChronicleMap view={preview} />
      </div>
    </div>
  );
}
