import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for deployment (node .next/standalone/server.js)
  output: "standalone",
  // No next/image usage; keep the /_next/image optimizer endpoint off.
  images: { unoptimized: true },
  // The share card reads its fonts from disk at runtime; the standalone
  // trace doesn't see readFile paths, so bundle them explicitly.
  outputFileTracingIncludes: {
    // Cards render on a worker thread (lib/cards/render-server.ts), which
    // nothing imports, so its script and renderer are listed here.
    "/*/card": ["./src/assets/fonts/**/*", "./scripts/og-worker.mjs", "./node_modules/next/dist/compiled/@vercel/og/**/*"],
    "/*/chronicles/card": [
      "./src/assets/fonts/**/*",
      "./scripts/og-worker.mjs",
      "./node_modules/next/dist/compiled/@vercel/og/**/*",
      "./public/consoles/*.png",
    ],
  },
  // Lets password managers jump straight to the change-password form
  // (https://w3c.github.io/webappsec-change-password-url/).
  async redirects() {
    return [
      { source: "/.well-known/change-password", destination: "/settings#password", permanent: false },
      // Profiles moved from /u/<username> to /<username>.
      { source: "/u/:username", destination: "/:username", permanent: true },
      { source: "/u/:username/card", destination: "/:username/card", permanent: true },
    ];
  },
};

export default nextConfig;
