import { prisma } from "./db";
import {
  MAX_ENTRIES,
  MAX_TITLE,
  checkBirthYear,
  checkEntry,
  cleanText,
  isAccent,
  isBackground,
  isPath,
} from "./chronicle";
import { ensureGame } from "./games";

// Console Chronicles writes, shared by the server actions (web) and
// /api/v1/chronicle (app). Each returns an error message, or null.

const clean = cleanText;

export type ChronicleSettingsInput = {
  title?: string | null;
  birthYear?: number | null;
  showAges?: boolean;
  accent?: string;
  background?: string;
  path?: string;
};

export type ChronicleEntryInput = {
  platformId: number;
  variant?: string | null;
  model?: string | null;
  gotAt: string;
  age?: number | null;
  note?: string | null;
  games?: number[];
};

async function ensureChronicle(userId: string) {
  await prisma.chronicle.upsert({ where: { userId }, update: {}, create: { userId } });
}

export async function saveChronicleSettingsForUser(userId: string, input: ChronicleSettingsInput): Promise<string | null> {
  const birthYear = checkBirthYear(input.birthYear);
  if (birthYear === false) return "Enter a year of birth like 1990";
  if (input.accent !== undefined && !isAccent(input.accent)) return "Invalid colour";
  if (input.background !== undefined && !isBackground(input.background)) return "Invalid background";
  if (input.path !== undefined && !isPath(input.path)) return "Invalid path style";
  const data = {
    title: clean(input.title, MAX_TITLE),
    birthYear,
    ...(input.showAges !== undefined && { showAges: Boolean(input.showAges) }),
    ...(input.accent !== undefined && { accent: input.accent }),
    ...(input.background !== undefined && { background: input.background }),
    ...(input.path !== undefined && { path: input.path }),
  };
  await prisma.chronicle.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  return null;
}

// Adds a console, or with entryId replaces one. Returns the entry's id.
export async function saveChronicleEntryForUser(
  userId: string,
  input: ChronicleEntryInput,
  entryId?: string | null
): Promise<{ ok: true; id: string } | { ok: false; error: string; notFound?: boolean }> {
  const checked = checkEntry(input);
  if (!checked.ok) return checked;
  const { igdbIds, ...fields } = checked.entry;
  if (!(await prisma.platform.findUnique({ where: { id: fields.platformId } }))) {
    return { ok: false, error: "Pick a console" };
  }

  await ensureChronicle(userId);
  if (entryId) {
    const existing = await prisma.chronicleEntry.findUnique({ where: { id: String(entryId) } });
    if (!existing || existing.userId !== userId) return { ok: false, error: "Console not found", notFound: true };
  } else if ((await prisma.chronicleEntry.count({ where: { userId } })) >= MAX_ENTRIES) {
    return { ok: false, error: `That's ${MAX_ENTRIES} consoles — the most a chronicle can hold` };
  }

  // Games come from IGDB like anywhere else; one that can't be looked up
  // fails the save rather than silently dropping it.
  const games: { id: string }[] = [];
  for (const igdbId of igdbIds) games.push(await ensureGame(igdbId));

  const data = fields;
  const entry = await prisma.$transaction(async (tx) => {
    const entry = entryId
      ? await tx.chronicleEntry.update({ where: { id: String(entryId) }, data })
      : await tx.chronicleEntry.create({ data: { ...data, userId } });
    await tx.chronicleGame.deleteMany({ where: { entryId: entry.id } });
    if (games.length) {
      await tx.chronicleGame.createMany({
        data: games.map((g, i) => ({ entryId: entry.id, position: i + 1, gameId: g.id })),
      });
    }
    return entry;
  });
  return { ok: true, id: entry.id };
}

export async function deleteChronicleEntryForUser(userId: string, entryId: string): Promise<boolean> {
  const { count } = await prisma.chronicleEntry.deleteMany({ where: { id: String(entryId), userId } });
  return count > 0;
}
