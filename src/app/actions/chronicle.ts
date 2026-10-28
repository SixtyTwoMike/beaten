"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  MAX_ENTRIES,
  MAX_MODEL,
  MAX_NOTE,
  MAX_TITLE,
  isAccent,
  isBackground,
  isPath,
} from "@/lib/chronicle";
import { variantOf } from "@/lib/console-art";
import { parsePartialDate } from "@/lib/dates";
import { ensureGame } from "@/lib/games";
import { isIgdbId } from "@/lib/limits";
import { requireUserId } from "@/lib/session";
import type { ActionResult } from "./logs";

// Console Chronicles: the look and birth year, and the consoles themselves.

const clean = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(/\s+/g, " ").trim() : "";
  return s ? s.slice(0, max) : null;
};

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
    const thisYear = new Date().getUTCFullYear();
    const birthYear = input.birthYear == null || input.birthYear === 0 ? null : Number(input.birthYear);
    if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > thisYear)) {
      return { ok: false, error: "Enter a year of birth like 1990" };
    }
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
    if (!isIgdbId(input.platformId)) return { ok: false, error: "Pick a console" };
    if (!(await prisma.platform.findUnique({ where: { id: input.platformId } }))) {
      return { ok: false, error: "Pick a console" };
    }
    const variant = input.variant ? String(input.variant) : null;
    if (variant && !variantOf(input.platformId, variant)) return { ok: false, error: "Pick a console" };
    const got = parsePartialDate(input.gotAt);
    const thisYear = new Date().getUTCFullYear();
    if (!got || got.date.getUTCFullYear() < 1970 || got.date.getUTCFullYear() > thisYear) {
      return { ok: false, error: "When did you get it? At least the year" };
    }
    const age = input.age == null || (input.age as unknown) === "" ? null : Number(input.age);
    if (age !== null && (!Number.isInteger(age) || age < 0 || age > 120)) {
      return { ok: false, error: "Age should be a whole number" };
    }
    const igdbIds = [...new Set(input.games ?? [])];
    if (igdbIds.length > 3 || !igdbIds.every(isIgdbId)) return { ok: false, error: "Pick up to three games" };

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

    const data = {
      platformId: input.platformId,
      variant,
      model: clean(input.model, MAX_MODEL),
      gotAt: got.date,
      gotPrecision: got.precision === "DAY" ? null : got.precision,
      age,
      note: clean(input.note, MAX_NOTE),
    };
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
