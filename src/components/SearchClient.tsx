"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ModalGame, PlatformOption, ShelfOption } from "@/lib/types";
import { GameCard } from "./GameCard";

type SearchResponse = {
  configured?: boolean;
  results?: ModalGame[];
  error?: string;
};

export function SearchClient({
  platforms,
  shelves,
  loggedIgdbIds,
  igdbConfigured,
}: {
  platforms: PlatformOption[];
  shelves: ShelfOption[];
  loggedIgdbIds: number[];
  igdbConfigured: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [platformId, setPlatformId] = useState(
    searchParams.get("platform") ?? ""
  );
  const [results, setResults] = useState<ModalGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!igdbConfigured) return;
    const q = query.trim();
    const timer = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        setSearched(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const params = new URLSearchParams({ q });
        if (platformId) params.set("platform", platformId);
        const res = await fetch(`/api/igdb/search?${params}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as SearchResponse;
        if (!res.ok) {
          setError(data.error ?? "Search failed");
          setResults([]);
        } else {
          setResults(data.results ?? []);
        }
        setSearched(true);
        // Keep the URL shareable/back-button friendly.
        const urlParams = new URLSearchParams({ q });
        if (platformId) urlParams.set("platform", platformId);
        router.replace(`/search?${urlParams}`, { scroll: false });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setError("Search failed");
        }
      } finally {
        setLoading(false);
      }
    }, q.length < 2 ? 0 : 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, platformId, igdbConfigured]);

  if (!igdbConfigured) {
    return (
      <div className="rounded-xl border border-gold/40 bg-gold/10 p-6">
        <h2 className="font-semibold text-gold">Game search isn&apos;t configured yet</h2>
        <p className="mt-2 text-sm text-fog">
          Search is powered by the IGDB API, which needs Twitch credentials. Create a
          (free) app at{" "}
          <a
            href="https://dev.twitch.tv/console/apps"
            className="text-mint hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            dev.twitch.tv/console/apps
          </a>{" "}
          and set <code className="text-white">TWITCH_CLIENT_ID</code> and{" "}
          <code className="text-white">TWITCH_CLIENT_SECRET</code> in{" "}
          <code className="text-white">.env</code> — or set{" "}
          <code className="text-white">IGDB_MOCK=1</code> to try the app with a
          built-in sample catalog.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          autoFocus
          placeholder="Search for a game…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-lg border border-edge bg-card px-4 py-3 text-base outline-none placeholder:text-fog/60 focus:border-mint/60 focus:ring-1 focus:ring-mint/40"
        />
        <select
          value={platformId}
          onChange={(e) => setPlatformId(e.target.value)}
          aria-label="Filter by platform"
          className="rounded-lg border border-edge bg-card px-3 py-3 text-sm outline-none focus:border-mint/60 sm:w-64"
        >
          <option value="">All platforms</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6">
        {loading && <p className="text-sm text-fog">Searching…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!loading && searched && results.length === 0 && !error && (
          <p className="text-sm text-fog">
            No games found for “{query.trim()}”
            {platformId ? " on that platform" : ""}.
          </p>
        )}
        {!searched && !loading && (
          <p className="text-sm text-fog">
            Type at least two characters to search
            {platformId ? " (platform filter applied)" : ""}.
          </p>
        )}
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {results.map((g) => (
            <GameCard
              key={g.igdbId}
              game={g}
              platforms={platforms}
              shelves={shelves}
              loggedIgdbIds={loggedIgdbIds}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
