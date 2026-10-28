"use client";

/* eslint-disable @next/next/no-img-element -- console photos are static files */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteChronicleEntry, saveChronicleEntry, saveChronicleSettings } from "@/app/actions/chronicle";
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
} from "@/lib/chronicle";
import { safeAction } from "@/lib/safe-action";
import { CARD_ACCENTS, type CardAccent } from "@/lib/share-card";
import { ChronicleMap } from "./ChronicleMap";
import { PartialDateField } from "./PartialDateField";
import { Poster } from "./Poster";

export type SuggestedGame = { igdbId: number; name: string; coverUrl: string | null };

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

function GamePicker({
  platformId,
  picked,
  onChange,
  suggestions,
}: {
  platformId: number | null;
  picked: SuggestedGame[];
  onChange: (games: SuggestedGame[]) => void;
  suggestions: { byPlatform: Record<number, SuggestedGame[]>; overall: SuggestedGame[] };
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SuggestedGame[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = picked.length >= 3;
  const fromDiary = (platformId != null && suggestions.byPlatform[platformId]?.length
    ? suggestions.byPlatform[platformId]
    : suggestions.overall
  ).filter((g) => !picked.some((p) => p.igdbId === g.igdbId));

  async function search(e: React.FormEvent | React.MouseEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: q.trim() });
      if (platformId) params.set("platform", String(platformId));
      const res = await fetch(`/api/igdb/search?${params}`);
      const data = (await res.json()) as { results?: SuggestedGame[] };
      if (!res.ok) throw new Error();
      setResults((data.results ?? []).slice(0, 8).map((g) => ({ igdbId: g.igdbId, name: g.name, coverUrl: g.coverUrl })));
    } catch {
      setError("Search failed — try again");
    } finally {
      setBusy(false);
    }
  }

  const add = (g: SuggestedGame) => !full && onChange([...picked, g]);
  const tile = (g: SuggestedGame, onClick: () => void, title: string) => (
    <li key={g.igdbId}>
      <button type="button" onClick={onClick} title={title} disabled={full} className="block w-full hover:opacity-80 disabled:opacity-40">
        <Poster name={g.name} coverUrl={g.coverUrl} />
        <span className="mt-1 block truncate text-[11px] text-fog">{g.name}</span>
      </button>
    </li>
  );

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-3 gap-2">
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
            <li key={`empty-${i}`} className="flex aspect-[3/4] items-center justify-center rounded-md border border-dashed border-edge text-xs text-fog">
              #{i + 1}
            </li>
          )
        )}
      </ul>
      {!full && fromDiary.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-fog">From your diary</p>
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">{fromDiary.slice(0, 6).map((g) => tile(g, () => add(g), `Add ${g.name}`))}</ul>
        </div>
      )}
      {!full && (
        <div>
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search(e as unknown as React.FormEvent)}
              placeholder="Search for a game"
              aria-label="Search for a game"
              className={field}
            />
            <button type="button" onClick={search} disabled={busy} className={quiet}>
              {busy ? "…" : "Search"}
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          {results && results.length === 0 && <p className="mt-1 text-xs text-fog">No games found.</p>}
          {results && results.length > 0 && (
            <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {results.filter((g) => !picked.some((p) => p.igdbId === g.igdbId)).map((g) => tile(g, () => add(g), `Add ${g.name}`))}
            </ul>
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
  onDone,
}: {
  stop: ChronicleStop | null;
  consoles: ConsoleOption[];
  suggestions: { byPlatform: Record<number, SuggestedGame[]>; overall: SuggestedGame[] };
  birthYear: number | null;
  onDone: () => void;
}) {
  const router = useRouter();
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
  const popular = consoles.filter((c) => c.popular).sort((a, b) => a.name.localeCompare(b.name));
  const autoAge = birthYear && gotAt ? Number(gotAt.slice(0, 4)) - birthYear : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() =>
        saveChronicleEntry({
          id: stop?.id,
          platformId: Number(platformId),
          variant: variantPart ?? null,
          model,
          gotAt,
          age: age.trim() ? Number(age) : null,
          note,
          games: games.map((g) => g.igdbId),
        })
      );
      if (!result.ok) return setError(result.error);
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-mint/30 bg-card p-4">
      <h3 className="font-semibold">{stop ? `Edit ${stop.platformName}` : "Add a console"}</h3>
      <div>
        <label className={label} htmlFor="chronicle-console">Console</label>
        <select id="chronicle-console" required value={choice} onChange={(e) => setChoice(e.target.value)} className={`${field} min-w-0`}>
          <option value="">Choose…</option>
          <optgroup label="Popular">
            {popular.map((c) => (
              <option key={c.value} value={c.value}>{c.name}</option>
            ))}
          </optgroup>
          <optgroup label="Everything else">
            {consoles.filter((c) => !c.popular).map((c) => (
              <option key={c.value} value={c.value}>{c.name}</option>
            ))}
          </optgroup>
        </select>
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
        <span className={label}>Top 3 games on it</span>
        <GamePicker platformId={platformId ? Number(platformId) : null} picked={games} onChange={setGames} suggestions={suggestions} />
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending || !platformId} className={primary}>
          {pending ? "Saving…" : stop ? "Save changes" : "Add to timeline"}
        </button>
        <button type="button" onClick={onDone} className={quiet}>Cancel</button>
      </div>
    </form>
  );
}

// Instagram story: fetch every page first (a story can't be shared after an
// await on iPhone, so it takes two taps), then hand them all to the share
// sheet, or offer downloads where sharing files isn't supported. Keyed by
// the chronicle's version, so edits start it afresh.
function StoryShare({ username, pages, version }: { username: string; pages: number; version: string }) {
  const [files, setFiles] = useState<File[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canShare = (f: File[]) => typeof navigator !== "undefined" && Boolean(navigator.canShare?.({ files: f }));
  const urls = useMemo(() => files?.map((f) => URL.createObjectURL(f)) ?? [], [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  async function prepare() {
    setBusy(true);
    setError(null);
    try {
      const made: File[] = [];
      for (let n = 1; n <= pages; n++) {
        const res = await fetch(`/${username}/chronicles/story?page=${n}&v=${version}`);
        if (!res.ok) throw new Error();
        made.push(new File([await res.blob()], `console-chronicles-${n}-of-${pages}.png`, { type: "image/png" }));
      }
      setFiles(made);
    } catch {
      setError("Couldn't make the story images — try again");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!files) return;
    try {
      await navigator.share({ files, title: "My console chronicles" });
    } catch {
      // Cancelled.
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-fog">
        {pages} story page{pages === 1 ? "" : "s"}, three consoles each, numbered so they post in order.
      </p>
      {!files ? (
        <button type="button" onClick={prepare} disabled={busy} className={primary}>
          {busy ? "Making images…" : "Make Instagram story"}
        </button>
      ) : canShare(files) ? (
        <button type="button" onClick={share} className={primary}>Share {files.length} image{files.length === 1 ? "" : "s"}</button>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {urls.map((u, i) => (
            <li key={u}>
              <a href={u} download={files[i].name} className={quiet}>Download {i + 1}/{files.length}</a>
            </li>
          ))}
        </ul>
      )}
      {files && (
        <ul className="flex gap-2 overflow-x-auto pt-1">
          {urls.map((u) => (
            <li key={u} className="w-20 shrink-0">
              <img src={u} alt="" className="rounded border border-edge" />
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

export function ChronicleEditor({
  view,
  consoles,
  suggestions,
  storyPages,
}: {
  view: ChronicleView;
  consoles: ConsoleOption[];
  suggestions: { byPlatform: Record<number, SuggestedGame[]>; overall: SuggestedGame[] };
  storyPages: number;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>({
    title: view.title === DEFAULT_TITLE ? "" : view.title,
    birthYear: view.birthYear ? String(view.birthYear) : "",
    showAges: view.showAges,
    accent: view.accent,
    background: view.background,
    path: view.path,
  });
  const [editing, setEditing] = useState<string | "new" | null>(view.stops.length === 0 ? "new" : null);
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
        const result = await safeAction(() => saveChronicleSettings({ ...settings, birthYear }));
        setSaveState(result.ok ? "saved" : result.error);
        if (result.ok) router.refresh();
      });
    }, 700);
    return () => clearTimeout(t);
  }, [settings, router]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  // The preview reflects unsaved choices straight away.
  const birthYear = /^\d{4}$/.test(settings.birthYear) ? Number(settings.birthYear) : null;
  const preview: ChronicleView = {
    ...view,
    title: settings.title.trim() || DEFAULT_TITLE,
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
      const result = await safeAction(() => deleteChronicleEntry(id));
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Console chronicles</h1>
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
              onDone={() => setEditing(null)}
            />
          ) : (
            <button type="button" onClick={() => setEditing("new")} className={primary}>+ Add a console</button>
          )}
        </Panel>

        <Panel title="Details">
          <div className="space-y-3">
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
          {view.username ? (
            <div className="space-y-4">
              <p className="text-sm">
                <Link href={`/${view.username}/chronicles`} className="text-mint hover:underline">
                  beaten.games/{view.username}/chronicles
                </Link>
              </p>
              {view.stops.length > 0 && <StoryShare key={version} username={view.username} pages={storyPages} version={version} />}
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

      <div>
        <ChronicleMap view={preview} />
      </div>
    </div>
  );
}
