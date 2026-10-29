"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  MAX_ENTRIES,
  MAX_TITLE,
  checkBirthYear,
  checkEntry,
  cleanText,
  isAccent,
  isBackground,
  isPath,
  type EntryFields,
} from "@/lib/chronicle";
import { ensureGame, ensureGames } from "@/lib/games";
import { requireUserId } from "@/lib/session";
import type { ActionResult } from "./logs";

// Console Chronicles: the look and birth year, and the consoles themselves.

const clean = cleanText;

function revalidate(username: string | null) {
  revalidatePath("/extras/chronicles");
  if (username) revalidatePath(`/${username}/chronicles`);
}

async function ensureChronicle(userId: string) {
  await prisma.chronicle.upsert({ where: { userId }, update: {}, create: { userId } });
}

export async function saveChronicleSettings(input: {
  title?: string | null;
  birthYear?: number | null;
  showAges?: boolean;
  accent?: string;
  background?: string;
  path?: string;
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const birthYear = checkBirthYear(input.birthYear);
    if (birthYear === false) return { ok: false, error: "Enter a year of birth like 1990" };
    if (input.accent !== undefined && !isAccent(input.accent)) return { ok: false, error: "Invalid colour" };
    if (input.background !== undefined && !isBackground(input.background)) return { ok: false, error: "Invalid background" };
    if (input.path !== undefined && !isPath(input.path)) return { ok: false, error: "Invalid path style" };
    const data = {
      title: clean(input.title, MAX_TITLE),
      birthYear,
      ...(input.showAges !== undefined && { showAges: Boolean(input.showAges) }),
      ...(input.accent !== undefined && { accent: input.accent }),
      ...(input.background !== undefined && { background: input.background }),
      ...(input.path !== undefined && { path: input.path }),
    };
    await prisma.chronicle.upsert({ where: { userId }, update: data, create: { userId, ...data } });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    revalidate(user?.username ?? null);
    return { ok: true };
  } catch (e) {
    console.error("saveChronicleSettings failed:", e);
    return { ok: false, error: "Something went wrong saving" };
  }
}

export async function saveChronicleEntry(input: {
  id?: string | null;
  platformId: number;
  variant?: string | null;
  model?: string | null;
  gotAt: string;
  age?: number | null;
  note?: string | null;
  games?: number[];
}): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const checked = checkEntry(input);
    if (!checked.ok) return checked;
    const { igdbIds, ...fields } = checked.entry;
    if (!(await prisma.platform.findUnique({ where: { id: fields.platformId } }))) {
      return { ok: false, error: "Pick a console" };
    }

    await ensureChronicle(userId);
    if (input.id) {
      const existing = await prisma.chronicleEntry.findUnique({ where: { id: String(input.id) } });
      if (!existing || existing.userId !== userId) return { ok: false, error: "Console not found" };
    } else if ((await prisma.chronicleEntry.count({ where: { userId } })) >= MAX_ENTRIES) {
      return { ok: false, error: `That's ${MAX_ENTRIES} consoles — the most a chronicle can hold` };
    }

    // Games come from IGDB like anywhere else; one that can't be looked up
    // fails the save rather than silently dropping it.
    const games: { id: string }[] = [];
    for (const igdbId of igdbIds) games.push(await ensureGame(igdbId));

    const data = fields;
    await prisma.$transaction(async (tx) => {
      const entry = input.id
        ? await tx.chronicleEntry.update({ where: { id: String(input.id) }, data })
        : await tx.chronicleEntry.create({ data: { ...data, userId } });
      await tx.chronicleGame.deleteMany({ where: { entryId: entry.id } });
      if (games.length) {
        await tx.chronicleGame.createMany({
          data: games.map((g, i) => ({ entryId: entry.id, position: i + 1, gameId: g.id })),
        });
      }
    });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    revalidate(user?.username ?? null);
    return { ok: true };
  } catch (e) {
    console.error("saveChronicleEntry failed:", e);
    return { ok: false, error: "Something went wrong saving that console" };
  }
}

export async function deleteChronicleEntry(id: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await prisma.chronicleEntry.deleteMany({ where: { id: String(id), userId } });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    revalidate(user?.username ?? null);
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
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    revalidate(user?.username ?? null);
    return { ok: true, imported: checked.length, skipped: entries.length - checked.length };
  } catch (e) {
    console.error("importGuestChronicle failed:", e);
    return { ok: false, error: "Something went wrong bringing your chronicle across" };
  }
}
