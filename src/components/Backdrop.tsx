// Wide key-art banner that fades into the page background. Renders nothing
// when there's no artwork (e.g. the built-in mock catalog).
export function Backdrop({ artworkUrl }: { artworkUrl: string | null }) {
  if (!artworkUrl) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 overflow-hidden sm:h-96"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={artworkUrl} alt="" className="h-full w-full object-cover opacity-60" />
      <div className="absolute inset-0 bg-linear-to-t from-canvas via-canvas/70 to-canvas/10" />
      <div className="absolute inset-0 bg-linear-to-r from-canvas/60 via-transparent to-canvas/60" />
    </div>
  );
}
