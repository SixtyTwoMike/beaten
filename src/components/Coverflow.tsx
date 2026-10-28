"use client";

import { useEffect, useState } from "react";
import { Poster } from "./Poster";

export type CoverflowItem = { name: string; coverUrl: string | null };

// Decorative coverflow: covers on a glossy floor with mirrored reflections,
// slowly cycling. Pauses on hover, and stays still for reduced motion.

const VISIBLE_SIDE = 3; // covers shown either side of the centre
const MIN_ITEMS = 2 * VISIBLE_SIDE + 2; // enough that wrap-around jumps stay hidden
const INTERVAL_MS = 3200;

function placement(offset: number) {
  const abs = Math.abs(offset);
  const side = Math.sign(offset);
  if (abs === 0) {
    return { transform: "translateX(-50%) translateZ(60px)", opacity: 1, z: 10 };
  }
  return {
    // Side covers tuck in behind each other, angled towards the centre.
    transform: `translateX(calc(-50% + ${side * (42 + abs * 30)}%)) translateZ(${-abs * 70}px) rotateY(${-side * 58}deg)`,
    opacity: abs > VISIBLE_SIDE ? 0 : 1 - abs * 0.18,
    z: 10 - abs,
  };
}

export function Coverflow({ items }: { items: CoverflowItem[] }) {
  // Repeat short lists so there are always covers on both sides.
  const covers =
    items.length === 0
      ? []
      : Array.from({ length: Math.max(items.length, MIN_ITEMS) }, (_, i) => items[i % items.length]);
  const count = covers.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || count < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % count), INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [paused, count]);

  if (count === 0) return null;
  const current = covers[active];

  return (
    <div
      aria-hidden="true"
      className="relative h-full w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Ambient glow from the centre cover. */}
      {current.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={current.coverUrl}
          src={current.coverUrl}
          alt=""
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-3xl saturate-150 transition-opacity duration-1000"
        />
      )}
      {/* Glossy floor: a faint horizon line and sheen under the covers. */}
      <div className="absolute inset-x-0 top-[62%] bottom-0 bg-gradient-to-b from-white/[0.06] via-canvas/70 to-canvas" />
      <div className="absolute inset-x-[8%] top-[62%] h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      <div
        className="absolute inset-x-0 top-[12%] h-[50%] lg:top-[18%] lg:h-[44%]"
        style={{ perspective: "1100px", perspectiveOrigin: "50% 40%" }}
      >
        {covers.map((game, i) => {
          // Shortest signed distance from the active cover, wrapping around.
          let offset = (i - active + count) % count;
          if (offset > count / 2) offset -= count;
          const p = placement(offset);
          return (
            <div
              key={i}
              className="absolute bottom-0 left-1/2 aspect-[3/4] h-full transition-[transform,opacity] duration-700 ease-[cubic-bezier(.2,.7,.2,1)]"
              style={{
                transform: p.transform,
                opacity: p.opacity,
                zIndex: p.z,
                transformStyle: "preserve-3d",
              }}
            >
              <div className="relative h-full w-full overflow-hidden rounded-md shadow-2xl shadow-black/70 ring-1 ring-white/10">
                <Poster name={game.name} coverUrl={game.coverUrl} className="h-full rounded-none" />
                {/* Glass sheen across the top of each cover. */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-white/0 to-transparent mix-blend-overlay" />
              </div>
              {/* Mirror image on the floor, fading out. */}
              <div
                className="pointer-events-none absolute left-0 top-full mt-1 h-full w-full overflow-hidden rounded-md"
                style={{
                  transform: "scaleY(-1)",
                  maskImage: "linear-gradient(to top, rgba(0,0,0,0.35), transparent 45%)",
                  WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.35), transparent 45%)",
                }}
              >
                <Poster name={game.name} coverUrl={game.coverUrl} className="h-full rounded-none" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
