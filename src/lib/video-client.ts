import type { ChronicleView, VideoStyle } from "./chronicle-core";
import type { VideoSize } from "./chronicle-video";
import type { YearReview } from "./year-review";

// Story videos are made on this device. Where the browser can, a Web
// Worker draws and encodes them (video.worker.ts) so the page stays
// responsive; otherwise the page does it, handing back control between
// frames.

export type VideoJob =
  | { kind: "chronicle"; view: ChronicleView; style: VideoStyle; size: VideoSize }
  | { kind: "year"; review: YearReview; size: VideoSize };

function inWorker(job: VideoJob, onProgress: (f: number) => void): Promise<Blob | null> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./video.worker.ts", import.meta.url), { type: "module" });
    const done = (blob: Blob | null) => {
      worker.terminate();
      resolve(blob);
    };
    worker.onmessage = (e: MessageEvent<{ progress?: number; blob?: Blob; unsupported?: boolean }>) => {
      if (e.data.progress != null) onProgress(e.data.progress);
      else done(e.data.blob ?? null);
    };
    worker.onerror = () => done(null);
    worker.postMessage(job);
  });
}

export async function makeVideo(job: VideoJob, name: string, onProgress: (f: number) => void): Promise<File> {
  const blob = await inWorker(job, onProgress);
  if (blob) return new File([blob], `${name}.mp4`, { type: blob.type });
  const { chroniclePlan, renderPlanVideo } = await import("./chronicle-video");
  const plan =
    job.kind === "chronicle"
      ? await chroniclePlan(job.view, job.style)
      : await import("./year-review-video").then(async (m) => m.yearReviewPlan(job.review, await m.loadReviewImages(job.review)));
  return renderPlanVideo(plan, job.size, onProgress, name);
}
