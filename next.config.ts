import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for deployment (node .next/standalone/server.js)
  output: "standalone",
  // No next/image usage; keep the /_next/image optimizer endpoint off.
  images: { unoptimized: true },
};

export default nextConfig;
