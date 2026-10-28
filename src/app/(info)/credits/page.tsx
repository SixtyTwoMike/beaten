import { prisma } from "@/lib/db";
import { consolePhotoCredits } from "@/lib/console-art";

export const metadata = {
  title: "Credits — Beaten",
  description: "Where Beaten's game data and console photos come from.",
};

const list = "list-disc space-y-1.5 pl-5 marker:text-fog";

export default async function CreditsPage() {
  const credits = consolePhotoCredits();
  const names = new Map(
    (await prisma.platform.findMany({
      where: { id: { in: credits.map((c) => c.platformId) } },
      select: { id: true, name: true },
    })).map((p) => [p.id, p.name])
  );
  const rows = credits
    .map((c) => ({ ...c, name: names.get(c.platformId) ?? c.file.replace(/^File:|\.\w+$/g, "") }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <article className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">Credits</h1>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Game data</h2>
        <p>
          Games, covers, artwork, platforms and console logos come from{" "}
          <a href="https://www.igdb.com" className="text-mint hover:underline" target="_blank" rel="noopener noreferrer">
            IGDB
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Console photos</h2>
        <p>
          The console photos in Console Chronicles come from Wikimedia Commons, most of them
          taken by Evan Amos. We&apos;ve cut out their backgrounds and resized them; edited
          versions of CC BY-SA photos are shared under the same licence.
        </p>
        <ul className={list}>
          {rows.map((c) => (
            <li key={c.platformId}>
              <span className="text-white">{c.name}</span>:{" "}
              <a href={c.source} className="text-mint hover:underline" target="_blank" rel="noopener noreferrer">
                photo
              </a>{" "}
              by {c.artist || "unknown"},{" "}
              {c.licenseUrl ? (
                <a href={c.licenseUrl} className="hover:underline" target="_blank" rel="noopener noreferrer">
                  {c.license}
                </a>
              ) : (
                c.license
              )}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
