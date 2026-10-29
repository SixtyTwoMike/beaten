"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MAX_ENTRIES, checkBirthYear, checkEntry, type ConsoleOption } from "@/lib/chronicle-core";
import {
  EMPTY_GUEST,
  guestView,
  readGuestChronicle,
  writeGuestChronicle,
  type GuestChronicleData,
} from "@/lib/guest-chronicle";
import { ChronicleEditor, type ChronicleStore } from "./ChronicleEditor";

// Console Chronicles without an account: the same editor, saving to this
// browser. Signing up or in brings it into the account (GuestChronicleImport).
// Browser-only: loaded without server rendering (GuestChronicleLoader).
export function GuestChronicle({ consoles }: { consoles: ConsoleOption[] }) {
  const [data, setData] = useState<GuestChronicleData>(() => readGuestChronicle() ?? EMPTY_GUEST);
  const [saved, setSaved] = useState(true);
  const latest = useRef<GuestChronicleData>(data);

  const store = useMemo<ChronicleStore>(() => {
    const commit = (next: GuestChronicleData) => {
      latest.current = next;
      setData(next);
      setSaved(writeGuestChronicle(next));
    };
    const values = new Set(consoles.map((c) => c.value));
    return {
      async saveSettings(s) {
        const birthYear = checkBirthYear(s.birthYear);
        if (birthYear === false) return { ok: false, error: "Enter a year of birth like 1990" };
        commit({ ...latest.current, title: s.title, name: s.name, birthYear, showAges: s.showAges, accent: s.accent, background: s.background, path: s.path });
        return { ok: true };
      },
      async saveEntry(e) {
        const c = checkEntry({ ...e, games: e.games.map((g) => g.igdbId) });
        if (!c.ok) return c;
        if (!values.has(`${e.platformId}${e.variant ? `:${e.variant}` : ""}`)) return { ok: false, error: "Pick a console" };
        const entries = latest.current.entries;
        if (!e.id && entries.length >= MAX_ENTRIES) {
          return { ok: false, error: `That's ${MAX_ENTRIES} consoles — the most a chronicle can hold` };
        }
        const entry = {
          id: e.id ?? crypto.randomUUID(),
          platformId: e.platformId,
          variant: c.entry.variant,
          model: c.entry.model,
          gotAt: e.gotAt,
          age: c.entry.age,
          note: c.entry.note,
          games: e.games.slice(0, 3),
        };
        commit({ ...latest.current, entries: e.id ? entries.map((x) => (x.id === e.id ? entry : x)) : [...entries, entry] });
        return { ok: true };
      },
      async deleteEntry(id) {
        commit({ ...latest.current, entries: latest.current.entries.filter((x) => x.id !== id) });
        return { ok: true };
      },
    };
  }, [consoles]);

  const view = useMemo(() => guestView(data, consoles), [data, consoles]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-mint/30 bg-mint/5 p-4 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm">
          {saved ? (
            <>
              <span className="font-semibold text-white">Saved on this device only.</span>{" "}
              <span className="text-fog">Make a free account to keep it safe, share a link to it, and log the games you play.</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-gold">This browser isn&apos;t letting us save.</span>{" "}
              <span className="text-fog">Your chronicle will be lost when you leave. Make a free account to keep it.</span>
            </>
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <Link href="/register?from=chronicles" className="rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110">
            Make an account
          </Link>
          <Link href="/login" className="rounded-md border border-edge px-3 py-2 text-sm text-fog hover:text-white">
            Sign in
          </Link>
        </div>
      </div>
      <ChronicleEditor view={view} consoles={consoles} suggestions={{ byPlatform: {} }} store={store} guest />
    </div>
  );
}
