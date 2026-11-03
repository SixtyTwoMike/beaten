// How a retro game was played: an optional answer on a diary entry, offered
// only for retro platforms (see isRetroPlatform). Client-safe.

export const PLAYED_ON = [
  { value: "ORIGINAL", label: "Original hardware", short: "Original" },
  { value: "FPGA", label: "FPGA", short: "FPGA" },
  { value: "EMULATION", label: "Emulation", short: "Emulated" },
  { value: "OFFICIAL", label: "Official re-release", short: "Re-release" },
  { value: "RECOMP", label: "Recomp / decomp", short: "Recomp" },
] as const;

export type PlayedOn = (typeof PLAYED_ON)[number]["value"];

export function isPlayedOn(value: unknown): value is PlayedOn {
  return PLAYED_ON.some((p) => p.value === value);
}

export function playedOnLabel(value: string | null | undefined, short = false): string | null {
  const option = PLAYED_ON.find((p) => p.value === value);
  return option ? (short ? option.short : option.label) : null;
}

// IGDB platform categories: 1 console, 2 arcade, 5 portable console,
// 6 computer (8-/16-bit home computers; modern PC is an operating system).
// Consoles and handhelds count up to generation 7 (PS3, 360, Wii, DS, PSP).
const RETRO_GENERATION = 7;

export function isRetroPlatform(p: { generation: number | null; category: number | null }): boolean {
  if (p.category === 2 || p.category === 6) return true;
  if (p.category === 1 || p.category === 5) return p.generation != null && p.generation <= RETRO_GENERATION;
  return false;
}
