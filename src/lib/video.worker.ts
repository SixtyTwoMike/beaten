// Makes story videos off the page's main thread: builds the plan, draws
// each frame on an OffscreenCanvas and encodes it (lib/video-client.ts
// starts this). Replies { unsupported } when this browser can't do that
// in a worker, so the page does it instead.
import { chroniclePlan, encodeOffscreen, type VideoPlan } from "./chronicle-video";
import { loadReviewImages, yearReviewPlan } from "./year-review-video";
import type { VideoJob } from "./video-client";

self.onmessage = async (e: MessageEvent<VideoJob>) => {
  const job = e.data;
  try {
    if (typeof VideoEncoder === "undefined" || typeof OffscreenCanvas === "undefined") {
      self.postMessage({ unsupported: true });
      return;
    }
    let plan: VideoPlan;
    if (job.kind === "chronicle") plan = await chroniclePlan(job.view, job.style);
    else plan = yearReviewPlan(job.review, await loadReviewImages(job.review));
    const blob = await encodeOffscreen(plan, job.size, (progress) => self.postMessage({ progress }));
    if (!blob) {
      self.postMessage({ unsupported: true });
      return;
    }
    self.postMessage({ blob });
  } catch (err) {
    // A font or codec this browser can't load in a worker: the page tries.
    console.warn("video worker:", err);
    self.postMessage({ unsupported: true });
  }
};
