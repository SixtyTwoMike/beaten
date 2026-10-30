"use client";

import { useEffect, useMemo, useState } from "react";
import type { YearReview } from "@/lib/year-review";

// The year in review as a story video, made on this device like the
// chronicle videos (lib/year-review-video.ts): render, then a second tap
// shares it (or downloads it where sharing files isn't supported).
const primary =
  "rounded-md bg-mint px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 disabled:opacity-50 transition";
const quiet =
  "rounded-md border border-edge px-3 py-2 text-sm text-fog hover:border-fog/50 hover:text-white disabled:opacity-50 transition";

export function YearReviewVideo({ review }: { review: YearReview }) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  const canShare = file != null && typeof navigator !== "undefined" && Boolean(navigator.canShare?.({ files: [file] }));

  async function make() {
    setError(null);
    setProgress(0);
    try {
      const [{ renderPlanVideo }, { loadReviewImages, yearReviewPlan }] = await Promise.all([
        import("@/lib/chronicle-video"),
        import("@/lib/year-review-video"),
      ]);
      const plan = yearReviewPlan(review, await loadReviewImages(review));
      setFile(await renderPlanVideo(plan, "full", setProgress, `beaten-${review.year}-in-review`));
    } catch (e) {
      console.error("year review video failed:", e);
      setError("Couldn't make the video on this device — try again");
    } finally {
      setProgress(null);
    }
  }

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: `My ${review.year} in games` });
    } catch {
      // Cancelled.
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-fog">Your year counted up, every cover, and your three favourites. Story-sized for Instagram.</p>
      {progress != null ? (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-card-2">
            <div className="h-full bg-mint transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-fog">Making your video… {Math.round(progress * 100)}%</p>
        </div>
      ) : !file ? (
        <button type="button" onClick={make} className={primary}>Make story video</button>
      ) : (
        <div className="space-y-3">
          <video src={url!} controls playsInline muted loop className="max-h-96 w-auto rounded-lg border border-edge" />
          <div className="flex flex-wrap gap-2">
            {canShare ? (
              <button type="button" onClick={share} className={primary}>Share video</button>
            ) : (
              <a href={url!} download={file.name} className={primary}>Download video</a>
            )}
            <button type="button" onClick={make} className={quiet}>Make again</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
