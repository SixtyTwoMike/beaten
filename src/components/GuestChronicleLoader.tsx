"use client";

import dynamic from "next/dynamic";

// The guest editor reads localStorage as it starts, so it only renders in
// the browser.
export const GuestChronicleLoader = dynamic(() => import("./GuestChronicle").then((m) => m.GuestChronicle), {
  ssr: false,
  loading: () => <p className="text-sm text-fog">Loading…</p>,
});

export const GuestChronicleImportLoader = dynamic(() => import("./GuestChronicleImport").then((m) => m.GuestChronicleImport), {
  ssr: false,
});
