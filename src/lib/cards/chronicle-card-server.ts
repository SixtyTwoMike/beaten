import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ChronicleView } from "../chronicle-core";
import { artSrc } from "./chronicle-card-markup";

// For drawing a chronicle card on the server: the console photos are our
// own files (public/consoles), which the renderer won't fetch from this
// host, so they're read from disk and inlined.
export async function withInlineArt(view: ChronicleView): Promise<ChronicleView> {
  const stops = await Promise.all(
    view.stops.map(async (s) => {
      if (!s.art || !s.art.src.startsWith("/consoles/")) return s;
      const file = path.join(process.cwd(), "public", artSrc(s.art.src));
      const data = await readFile(file).catch(() => null);
      return { ...s, art: data ? { ...s.art, src: `data:image/png;base64,${data.toString("base64")}` } : null };
    })
  );
  return { ...view, stops };
}
