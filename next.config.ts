import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for deployment (node .next/standalone/server.js)
  output: "standalone",
  // No next/image usage; keep the /_next/image optimizer endpoint off.
  images: { unoptimized: true },
  // The share card reads its fonts from disk at runtime; the standalone
  // trace doesn't see readFile paths, so bundle them explicitly.
  outputFileTracingIncludes: {
    "/u/*/card": ["./src/assets/fonts/**/*"],
  },
  // Lets password managers jump straight to the change-password form
  // (https://w3c.github.io/webappsec-change-password-url/).
  async redirects() {
    return [
      { source: "/.well-known/change-password", destination: "/settings#password", permanent: false },
    ];
  },
};

export default nextConfig;
