import { prisma } from "./db";
import { appUrl } from "./email";
import { loadChronicle, type ChronicleView, type ConsoleOption } from "./chronicle";
import type { ConsoleArt } from "./console-art";

// Console Chronicles as the app gets it. Console photos are served from
// this site (/consoles/…), so their paths are made absolute.

const absolute = (src: string) => (src.startsWith("/") ? new URL(src, appUrl()).toString() : src);
const artJson = (art: ConsoleArt | null) => (art ? { ...art, src: absolute(art.src) } : null);

export function chronicleJson(view: ChronicleView) {
  return { ...view, stops: view.stops.map((s) => ({ ...s, art: artJson(s.art) })) };
}

export function consoleJson(c: ConsoleOption) {
  return { ...c, thumb: c.thumb ? absolute(c.thumb) : null, art: artJson(c.art) };
}

export async function chronicleFor(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, username: true } });
  return chronicleJson(await loadChronicle(user));
}
