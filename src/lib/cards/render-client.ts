import type { CardJob } from "./card.worker";

// Cards drawn on this device: a Web Worker lays them out (card.worker.ts),
// so the page stays responsive, and gives back an SVG, which previews as
// is; a canvas turns it into a PNG for downloading or sharing.

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (r: { svg: string; width: number; height: number }) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./card.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<{ id: number; svg?: string; width: number; height: number; error?: string }>) => {
    const job = pending.get(e.data.id);
    if (!job) return;
    pending.delete(e.data.id);
    if (e.data.svg) job.resolve({ svg: e.data.svg, width: e.data.width, height: e.data.height });
    else job.reject(new Error(e.data.error ?? "card failed"));
  };
  worker.onerror = (e) => {
    for (const job of pending.values()) job.reject(new Error(e.message || "card worker failed"));
    pending.clear();
    worker = null;
  };
  return worker;
}

export function renderCardSvg(job: CardJob): Promise<{ svg: string; width: number; height: number }> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, job });
  });
}

export const svgUrl = (svg: string) => URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));

// The SVG as a PNG file at its full size.
export async function svgToPng(svg: string, width: number, height: number, name: string): Promise<File> {
  const url = svgUrl(svg);
  try {
    const img = new Image(width, height);
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) throw new Error("couldn't make the PNG");
    return new File([blob], `${name}.png`, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
