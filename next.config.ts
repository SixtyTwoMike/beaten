import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for deployment (node .next/standalone/server.js)
  output: "standalone",
};

export default nextConfig;
