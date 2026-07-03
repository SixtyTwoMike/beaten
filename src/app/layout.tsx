import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
