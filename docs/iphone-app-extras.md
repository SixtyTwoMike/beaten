# Beaten for iPhone — Extras, videos and share cards (1.1)

Status: **in progress** (started 2026-10-30), branch `feature/ios-app`.
1.0 (the logging app) is in App Review; this is the next version.

What it adds, in the app and (for the videos) on the web too:

- **Console Chronicles** in the app: view, edit and restyle your
  chronicle, the same data as `/extras/chronicles`.
- **Three new videos** alongside today's road video:
  - *Year by year* (chronicles): one console per beat, the year and your
    age tick over, the console drops in, its three games pop up.
  - *Retro CRT* (chronicles): a TV slideshow with scanlines, a pixel
    font and channel-static cuts.
  - *Year in review* (diary): the games you finished this year,
    Wrapped-style.
- **Share cards** in the app: the existing PNG cards (square, story,
  link preview), plus the videos, through the iOS share sheet and a
  direct **Instagram Stories** button.

## Decisions

- Videos are rendered **on the phone** (Swift, hardware H.264 through
  AVAssetWriter), like the web renders them in the browser. Each style
  therefore exists twice, `src/lib/chronicle-video*.ts` and
  `ios/Beaten/Features/Extras/Video/`. Both follow the same spec (below);
  change one, change the other.
- Instagram Stories uses Instagram's documented pasteboard hand-off
  (`instagram-stories://share`), which needs a **Meta app ID**
  (`INSTAGRAM_APP_ID` → Info.plist `BeatenMetaAppID`). Without one the
  button is hidden and the share sheet still offers Instagram.
- Share-card PNGs keep coming from the server (`/<username>/card`), so
  the app and web cards are identical. The app downloads the PNG and
  shares the file.

## API additions

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/chronicle` | your `ChronicleView` + suggested games per console |
| PATCH | `/api/v1/chronicle` | title, birth year, show ages, accent, background, path |
| POST | `/api/v1/chronicle/entries` | add a console |
| PATCH/DELETE | `/api/v1/chronicle/entries/:id` | |
| GET | `/api/v1/chronicle/consoles` | console picker options (cacheable) |
| GET | `/api/v1/year-review?year=` | finished games and totals for the year-in-review video |

Chronicle writes move out of `src/app/actions/chronicle.ts` into
`src/lib/chronicle-write.ts` (`…ForUser`), as logs and shelves did.

## Video spec

All 1080×1920, 30 fps, H.264, under 60 s (Instagram's story limit), the
chronicle's accent colour throughout.

- **Road** (exists): camera glides down the zig-zag road, cards slide in.
- **Year by year**: 0.8 s title card; per console 2.2 s: year counter
  rolls to the year (age underneath if shown), console art drops in with
  a bounce, the three covers pop in staggered, note fades in; 2 s outro
  with the console count and beaten.games/username.
- **Retro CRT**: black bezel, scanlines and slight barrel glow over
  everything; pixel font (bundled, OFL); per console 2.4 s: "CH nn" in the
  corner, the console and covers in a chunky frame; 0.3 s white-noise cut
  between; outro "END OF TRANSMISSION".
- **Year in review**: title "My <year> in games"; total finished,
  mastered, hours if known; up to 12 covers in a quick-cut grid build; top
  rated three with their stars; outro with the profile link.

## Build order

1. ✅ Server: chronicle-write extraction, the chronicle API, smoke checks
   (deployed 2026-10-30).
2. ✅ App: Extras hub (from Profile and Home), chronicle viewer in the
   chosen style, editor (console picker, date, model, note, three games,
   age), settings. `ChronicleTests` UI test. TestFlight 1.1.0 (3).
3. App: share cards (pick options, preview, share sheet).
4. Videos: Road in Swift; Year by year and Retro CRT on web + app.
5. Year in review: API, web page, app, video.
6. Instagram Stories button once the Meta app ID exists.
7. TestFlight 1.1, test plan additions, App Review.
