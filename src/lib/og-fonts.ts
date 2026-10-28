import { readFile } from "node:fs/promises";
import path from "node:path";

// Fonts for generated images (share cards, chronicle stories). Read from
// disk once; next.config.ts bundles them for each route that uses them.

type Font = { name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" };
let fonts: Promise<Font[]> | null = null;

export function loadFonts(): Promise<Font[]> {
  const dir = path.join(process.cwd(), "src/assets/fonts");
  fonts ??= Promise.all(
    ([
      ["Geist-Regular.ttf", 400],
      ["Geist-SemiBold.ttf", 600],
      ["Geist-Bold.ttf", 700],
    ] as const).map(async ([file, weight]) => ({
      name: "Geist",
      data: await readFile(path.join(dir, file)),
      weight,
      style: "normal" as const,
    }))
  );
  return fonts;
}
