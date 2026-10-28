/* eslint-disable @next/next/no-img-element -- console photos are static files; IGDB logos are remote */
import type { ChronicleStop, ChronicleView } from "@/lib/chronicle";
import { BADGE_LABELS } from "@/lib/chronicle";
import { Poster } from "./Poster";

// The zig-zag road through someone's consoles. Plain markup (no hooks) so
// the public page and the editor's live preview render the same thing.

// Stops sit on alternate sides; the road swings between their centres.
// Phones: stops are 58% wide, so centres at 29% / 71%. Wider: 46%.
const ROAD = {
  narrow: { left: 290, right: 710 },
  wide: { left: 230, right: 770 },
};

function roadStroke(view: ChronicleView) {
  const base = { stroke: view.accentHex, fill: "none", vectorEffect: "non-scaling-stroke" as const };
  if (view.path === "neon") return { ...base, strokeWidth: 3, style: { filter: `drop-shadow(0 0 6px ${view.accentHex})` } };
  if (view.path === "pixel") return { ...base, strokeWidth: 8, strokeDasharray: "10 10", strokeOpacity: 0.85 };
  return { ...base, strokeWidth: 5, strokeDasharray: "0.5 14", strokeLinecap: "round" as const };
}

function Road({ view, fromLeft }: { view: ChronicleView; fromLeft: boolean }) {
  const stroke = roadStroke(view);
  const curve = (x: { left: number; right: number }) => {
    const [a, b] = fromLeft ? [x.left, x.right] : [x.right, x.left];
    return `M ${a} 0 C ${a} 70, ${b} 30, ${b} 100`;
  };
  return (
    <>
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="block h-14 w-full sm:hidden" aria-hidden>
        <path d={curve(ROAD.narrow)} {...stroke} />
      </svg>
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="hidden h-20 w-full sm:block" aria-hidden>
        <path d={curve(ROAD.wide)} {...stroke} />
      </svg>
    </>
  );
}

function Stop({ stop, view, index }: { stop: ChronicleStop; view: ChronicleView; index: number }) {
  const accent = view.accentHex;
  const right = index % 2 === 1;
  return (
    <li>
      {index > 0 && <Road view={view} fromLeft={right} />}
      <div className={`w-[58%] rounded-2xl border border-white/10 bg-card/70 p-4 shadow-xl backdrop-blur sm:w-[46%] sm:p-5 ${right ? "ml-auto" : ""}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: accent }}>
            {stop.gotLabel}
          </span>
          {view.showAges && stop.age != null && (
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white">Age {stop.age}</span>
          )}
        </div>

        <div className="my-3 flex h-24 items-center justify-center sm:h-32">
          {stop.art?.kind === "photo" ? (
            <img
              src={stop.art.src}
              alt=""
              width={stop.art.width}
              height={stop.art.height}
              className="max-h-full w-auto max-w-full object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)]"
            />
          ) : stop.art ? (
            <div className="flex h-full w-full items-center justify-center rounded-xl bg-white/90 p-3">
              <img src={stop.art.src} alt="" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-xl bg-white/5 text-sm text-fog">
              {stop.platformName}
            </div>
          )}
        </div>

        {stop.badges.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {stop.badges.map((b) => (
              <span
                key={b}
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-canvas"
                style={{ backgroundColor: accent }}
              >
                ★ {BADGE_LABELS[b]}
              </span>
            ))}
          </div>
        )}
        <p className="font-semibold leading-snug text-white">
          {stop.platformName}
          {stop.model && <span className="font-normal text-fog"> · {stop.model}</span>}
        </p>
        {stop.note && <p className="mt-1 text-sm italic text-fog">“{stop.note}”</p>}

        {stop.games.length > 0 && (
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {stop.games.map((g) => (
              <li key={g.igdbId} title={g.name}>
                <Poster name={g.name} coverUrl={g.coverUrl} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function chronicleBackground(view: ChronicleView): React.CSSProperties {
  const a = view.accentHex;
  if (view.background === "plain") return {};
  if (view.background === "grid") {
    return {
      backgroundImage: `linear-gradient(to bottom, transparent 0%, ${a}14 100%), repeating-linear-gradient(0deg, ${a}1f 0 1px, transparent 1px 48px), repeating-linear-gradient(90deg, ${a}1f 0 1px, transparent 1px 48px)`,
    };
  }
  return {
    backgroundImage: `radial-gradient(60% 40% at 10% 0%, ${a}33, transparent 70%), radial-gradient(60% 40% at 90% 60%, ${a}22, transparent 70%), radial-gradient(50% 30% at 20% 100%, ${a}1a, transparent 70%)`,
  };
}

export function ChronicleMap({ view }: { view: ChronicleView }) {
  const first = view.stops[0];
  const last = view.stops[view.stops.length - 1];
  return (
    <div className="overflow-hidden rounded-3xl border border-edge bg-canvas px-3 py-8 sm:px-8 sm:py-10" style={chronicleBackground(view)}>
      <header className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: view.accentHex }}>
          Console chronicles
        </p>
        <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{view.title}</h2>
        <p className="mt-2 text-sm text-fog">
          {view.name}
          {first && (
            <>
              {" · "}
              {view.stops.length} console{view.stops.length === 1 ? "" : "s"}
              {first.year !== last.year ? ` · ${first.year}–${last.year}` : ` · ${first.year}`}
            </>
          )}
        </p>
      </header>
      {view.stops.length === 0 ? (
        <p className="py-10 text-center text-sm text-fog">No consoles yet.</p>
      ) : (
        <ol>
          {view.stops.map((stop, i) => (
            <Stop key={stop.id} stop={stop} view={view} index={i} />
          ))}
        </ol>
      )}
    </div>
  );
}
