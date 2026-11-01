import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
import { appUrl } from "@/lib/email";
import { UMAMI_WEBSITE_ID } from "@/lib/site";

export const metadata: Metadata = {
  // Absolute base for OG images (share cards) and other relative metadata URLs.
  metadataBase: new URL(appUrl()),
  title: "Beaten — track the games you've conquered",
  description:
    "A Letterboxd-style log for the games you've beaten and mastered.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        {children}
        {/* Page views to our own Umami, served first-party from /a/ (nginx).
            Query strings and hashes are left out, so sign-in and reset
            tokens never reach it; Do Not Track is respected. Production
            only, and only on the real domain. */}
        {process.env.NODE_ENV === "production" && (
          <Script
            src="/a/script.js"
            strategy="afterInteractive"
            data-website-id={UMAMI_WEBSITE_ID}
            data-host-url="/a"
            data-domains="beaten.games"
            data-exclude-search="true"
            data-exclude-hash="true"
            data-do-not-track="true"
          />
        )}
      </body>
    </html>
  );
}
