import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for deployment (node .next/standalone/server.js)
  output: "standalone",
  // No next/image usage; keep the /_next/image optimizer endpoint off.
  images: { unoptimized: true },
  // Lets password managers jump straight to the change-password form
  // (https://w3c.github.io/webappsec-change-password-url/).
  async redirects() {
    return [
      { source: "/.well-known/change-password", destination: "/settings#password", permanent: false },
    ];
  },
};

export default nextConfig;
