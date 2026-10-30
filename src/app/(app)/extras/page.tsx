import Link from "next/link";

export const metadata = { title: "Extras — Beaten" };

// Fun things to make from your gaming history.
const EXTRAS = [
  {
    href: "/extras/chronicles",
    title: "Console Chronicles",
    body: "Map every console you've owned — when you got it, how old you were, and the three games that defined it.",
  },
  {
    href: "/extras/year",
    title: "Year in review",
    body: "Everything you finished in a year, counted up with your favourites, as a story video.",
  },
];

export default function ExtrasPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Extras</h1>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {EXTRAS.map((x) => (
          <li key={x.href}>
            <Link href={x.href} className="block h-full rounded-xl border border-edge bg-card p-5 transition hover:border-mint/50">
              <h2 className="font-semibold text-white">{x.title}</h2>
              <p className="mt-1 text-sm text-fog">{x.body}</p>
              <span className="mt-3 inline-block text-sm text-mint">Open →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
