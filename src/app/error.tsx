"use client";

import { useEffect } from "react";
import Link from "next/link";

// Last-resort fallback for unexpected errors anywhere below the root layout.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-sm text-fog">
        That didn&apos;t work — possibly too many requests in a short time, or a
        dropped connection. Wait a moment and try again.
      </p>
      <div className="flex gap-3 text-sm">
        <button
          onClick={() => retry()}
          className="rounded-md bg-mint px-4 py-2 font-semibold text-canvas hover:brightness-110 transition"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-edge px-4 py-2 text-fog hover:border-fog/50 hover:text-white transition"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
