"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { MAX_ENTRIES, MAX_TITLE, checkBirthYear, checkEntry, cleanText, isAccent, isBackground, isPath, type EntryFields } from "@/lib/chronicle";
import {
  deleteChronicleEntryForUser,
  saveChronicleEntryForUser,
  saveChronicleSettingsForUser,
  type ChronicleEntryInput,
  type ChronicleSettingsInput,
} from "@/lib/chronicle-write";
import { ensureGames } from "@/lib/games";
import { requireUserId } from "@/lib/session";
import type { ActionResult } from "./logs";

// Console Chronicles: the look and birth year, and the consoles themselves.
// The checks live in lib/chronicle-write (shared with the app's API).

const clean = cleanText;

async function revalidate(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  revalidatePath("/extras/chronicles");
  if (user?.username) revalidatePath(`/${user.username}/chronicles`);
}

export async function saveChronicleSettings(input: ChronicleSettingsInput): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const error = await saveChronicleSettingsForUser(userId, input);
    if (error) return { ok: false, error };
    await revalidate(userId);
    return { ok: true };
  } catch (e) {
    console.error("saveChronicleSettings failed:", e);
    return { ok: false, error: "Something went wrong saving" };
  }
}

export async function saveChronicleEntry(input: ChronicleEntryInput & { id?: string | null }): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const res = await saveChronicleEntryForUser(userId, input, input.id);
    if (!res.ok) return { ok: false, error: res.error };
    await revalidate(userId);
    return { ok: true };
  } catch (e) {
    console.error("saveChronicleEntry failed:", e);
    return { ok: false, error: "Something went wrong saving that console" };
  }
}

export async function deleteChronicleEntry(id: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await deleteChronicleEntryForUser(userId, id);
    await revalidate(userId);
    return { ok: true };
  } catch (e) {
    console.error("deleteChronicleEntry failed:", e);
    return { ok: false, error: "Something went wrong" };
  }
}

// A chronicle made without an account (saved in the browser), brought in
// after signing up or in. "replace" swaps out any existing consoles;
// otherwise it's only imported into an empty chronicle. Everything is
// checked as if typed, and games are looked up on IGDB, never taken from
// the browser.
export async function importGuestChronicle(
  input: {
    settings: { title?: string | null; birthYear?: number | null; showAges?: boolean; accent?: string; background?: string; path?: string };
    entries: EntryFields[];
  },
  mode: "if-empty" | "replace"
): Promise<ActionResult & { imported?: number; skipped?: number }> {
  try {
    const userId = await requireUserId();
    const entries = Array.isArray(input?.entries) ? input.entries.slice(0, MAX_ENTRIES) : [];
    if (entries.length === 0) return { ok: false, error: "Nothing to import" };
    if (mode !== "replace" && (await prisma.chronicleEntry.count({ where: { userId } })) > 0) {
      return { ok: false, error: "You already have a chronicle" };
    }

    const platforms = new Set(
      (await prisma.platform.findMany({ where: { id: { in: entries.map((e) => Number(e?.platformId)).filter(Number.isInteger) } }, select: { id: true } })).map(
        (p) => p.id
      )
    );
    const checked = entries.flatMap((e) => {
      const c = checkEntry(e);
      return c.ok && platforms.has(c.entry.platformId) ? [c.entry] : [];
    });
    const games = await ensureGames(checked.flatMap((e) => e.igdbIds));

    const s = input.settings ?? {};
    const birthYear = checkBirthYear(s.birthYear);
    const settings = {
      title: clean(s.title, MAX_TITLE),
      birthYear: birthYear === false ? null : birthYear,
      showAges: s.showAges !== false,
      ...(isAccent(s.accent) && { accent: s.accent }),
      ...(isBackground(s.background) && { background: s.background }),
      ...(isPath(s.path) && { path: s.path }),
    };

    await prisma.$transaction(async (tx) => {
      await tx.chronicle.upsert({ where: { userId }, update: settings, create: { userId, ...settings } });
      await tx.chronicleEntry.deleteMany({ where: { userId } });
      for (const { igdbIds, ...fields } of checked) {
        const entry = await tx.chronicleEntry.create({ data: { ...fields, userId } });
        const ids = igdbIds.flatMap((id) => (games.get(id) ? [games.get(id)!.id] : []));
        if (ids.length) {
          await tx.chronicleGame.createMany({ data: ids.map((gameId, i) => ({ entryId: entry.id, position: i + 1, gameId })) });
        }
      }
    });
    await revalidate(userId);
    return { ok: true, imported: checked.length, skipped: entries.length - checked.length };
  } catch (e) {
    console.error("importGuestChronicle failed:", e);
    return { ok: false, error: "Something went wrong bringing your chronicle across" };
  }
}
