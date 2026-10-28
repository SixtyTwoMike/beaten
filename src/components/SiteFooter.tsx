import Link from "next/link";

// Shared footer for app, auth, and public pages.

const SISTER_SITES = [
  { href: "https://bestofdecades.online", label: "Best of Decades" },
  { href: "https://neverseenwhat.com", label: "You've Never Seen What?" },
];

export function SiteFooter() {
  const igdbSource =
    process.env.IGDB_MOCK === "1" ? "from built-in sample catalog" : "via IGDB";
  return (
    <footer className="border-t border-edge px-4 py-6 text-center text-xs text-fog/60">
      <p>
        Beaten — game data {igdbSource} ·{" "}
        <Link href="/support" className="text-fog hover:text-white hover:underline">
          Support
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="text-fog hover:text-white hover:underline">
          Privacy
        </Link>
      </p>
      <p className="mt-2">
        Also try{" "}
        {SISTER_SITES.map((site, i) => (
          <span key={site.href}>
            {i > 0 && " · "}
            <a
              href={site.href}
              target="_blank"
              rel="noopener"
              className="text-fog hover:text-white hover:underline"
            >
              {site.label}
            </a>
          </span>
        ))}
      </p>
    </footer>
  );
}
