// Draws cards in the browser, off the page's main thread: satori turns the
// shared markup into an SVG (lib/cards/render-client.ts starts this).
// Images are fetched here once and inlined, so the SVG stands alone and a
// canvas can turn it into a PNG without being tainted.
import satori from "satori";
import { chronicleCardMarkup, type ChronicleCardOptions } from "./chronicle-card-markup";
import { shareCardMarkup, type ShareCardData } from "./share-card-markup";
import type { ChronicleView } from "../chronicle-core";
import type { CardOptions } from "../share-card";
import { CARD_FORMATS } from "../share-card";

export type CardJob =
  | { kind: "share"; data: ShareCardData; opts: CardOptions }
  | { kind: "chronicle"; data: ChronicleView; opts: ChronicleCardOptions };

let fonts: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 600 | 700; style: "normal" }[]> | null = null;
function loadFonts() {
  fonts ??= Promise.all(
    ([
      ["Geist-Regular.ttf", 400],
      ["Geist-SemiBold.ttf", 600],
      ["Geist-Bold.ttf", 700],
    ] as const).map(async ([file, weight]) => ({
      name: "Geist",
      data: await (await fetch(`/fonts/${file}`)).arrayBuffer(),
      weight,
      style: "normal" as const,
    }))
  );
  return fonts;
}

// URL → data: URI (null when it can't be fetched, e.g. no CORS).
const images = new Map<string, Promise<string | null>>();
function inline(url: string): Promise<string | null> {
  let p = images.get(url);
  if (!p) {
    p = fetch(url)
      .then(async (r) => {
        if (!r.ok) return null;
        const blob = await r.blob();
        return await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      })
      .catch(() => null);
    images.set(url, p);
  }
  return p;
}

// Every <img src> in the markup, inlined; ones that can't load are dropped.
async function inlineImages(node: unknown): Promise<unknown> {
  if (Array.isArray(node)) return Promise.all(node.map(inlineImages));
  if (!node || typeof node !== "object" || !("props" in node)) return node;
  const el = node as { type: unknown; props: Record<string, unknown> };
  if (typeof el.type === "function") return inlineImages((el.type as (p: unknown) => unknown)(el.props));
  const props = { ...el.props };
  if (el.type === "img" && typeof props.src === "string" && !props.src.startsWith("data:")) {
    const data = await inline(props.src);
    if (!data) return null;
    props.src = data;
  }
  if (props.children !== undefined) props.children = await inlineImages(props.children);
  return { ...el, props };
}

self.onmessage = async (e: MessageEvent<{ id: number; job: CardJob }>) => {
  const { id, job } = e.data;
  try {
    const markup = job.kind === "share" ? shareCardMarkup(job.data, job.opts) : chronicleCardMarkup(job.data, job.opts);
    const { width, height } = CARD_FORMATS[job.opts.format];
    const [tree, fontList] = await Promise.all([inlineImages(markup), loadFonts()]);
    const svg = await satori(tree as never, { width, height, fonts: fontList });
    self.postMessage({ id, svg, width, height });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
