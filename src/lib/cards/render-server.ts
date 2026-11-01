import path from "node:path";
import { Worker } from "node:worker_threads";
import { isValidElement, type ReactNode } from "react";

// Renders card markup to a PNG on a worker thread (scripts/og-worker.mjs),
// so the seconds a card takes on the server don't stall every other
// request. One worker, jobs one at a time; it's restarted if it dies or a
// job takes too long.

const TIMEOUT_MS = 30_000;

type Job = { resolve: (png: ArrayBuffer) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };
let worker: Worker | null = null;
const jobs = new Map<number, Job>();
let nextId = 0;

function failAll(error: Error) {
  for (const job of jobs.values()) {
    clearTimeout(job.timer);
    job.reject(error);
  }
  jobs.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  const cwd = process.cwd();
  const w = new Worker(/* turbopackIgnore: true */ path.join(cwd, "scripts/og-worker.mjs"), {
    workerData: { fontDir: path.join(cwd, "src/assets/fonts") },
    resourceLimits: { maxOldGenerationSizeMb: 256 },
  });
  w.on("message", (m: { id: number; png?: ArrayBuffer; error?: string }) => {
    const job = jobs.get(m.id);
    if (!job) return;
    jobs.delete(m.id);
    clearTimeout(job.timer);
    if (m.png) job.resolve(m.png);
    else job.reject(new Error(m.error ?? "render failed"));
  });
  const reset = (e: Error) => {
    if (worker === w) worker = null;
    failAll(e);
  };
  w.on("error", reset);
  w.on("exit", (code) => reset(new Error(`card worker exited (${code})`)));
  w.unref();
  worker = w;
  return w;
}

// React elements to plain { type, props } (function components called), so
// they can be posted to the worker.
function toPlain(node: ReactNode): unknown {
  if (Array.isArray(node)) return node.map(toPlain);
  if (!isValidElement(node)) return node ?? null;
  const { type, props } = node as { type: unknown; props: Record<string, unknown> };
  if (typeof type === "function") return toPlain((type as (p: unknown) => ReactNode)(props));
  const { children, ...rest } = props;
  return { type, props: { ...rest, children: toPlain(children as ReactNode) } };
}

export function renderPng(markup: ReactNode, width: number, height: number): Promise<ArrayBuffer> {
  const tree = toPlain(markup);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      jobs.delete(id);
      reject(new Error("card render timed out"));
      // A stuck render: start afresh for the next one.
      void worker?.terminate();
    }, TIMEOUT_MS);
    jobs.set(id, { resolve, reject, timer });
    getWorker().postMessage({ id, tree, width, height });
  });
}
