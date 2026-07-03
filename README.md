# Beaten

A Letterboxd-style web portal for tracking the games you've **beaten** and **mastered**. Search the [IGDB](https://www.igdb.com/) catalog, log finished games with platform, dates, ratings, and reviews, and organize them into custom shelves.

## Features

- **Game search** powered by the IGDB API, with a platform filter dropdown (platform list synced from IGDB and cached locally)
- **"I've beaten this" / "I've mastered this"** quick-log actions on every search result and game page
- **Play log entries** with:
  - Beaten or Mastered status
  - Platform played on
  - Optional start date + finish date (Goodreads-style)
  - First time play vs. replay
  - Half-step star rating (0.5–5 ★)
  - Review text
- **Diary** view of all entries, filterable by status, platform, and year, with edit/delete
- **Custom shelves** (create inline while logging, or manage on the Shelves page)
- **Dashboard** with yearly stats and recently finished games
- **Auth**: email + password (bcrypt), plus optional Google OAuth — protected app routes, JWT sessions

## Stack

Next.js (App Router, TypeScript) · Tailwind CSS · Prisma + SQLite · Auth.js (next-auth v5) · IGDB via Twitch OAuth

## Getting started

```bash
npm install
cp .env.example .env       # then edit — see below
npx prisma db push         # creates prisma/dev.db
npm run dev                # http://localhost:3000
```

### Environment

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Session signing secret — `openssl rand -base64 32` |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | IGDB API access. Register a free app at [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) (OAuth redirect URL can be `http://localhost`) |
| `IGDB_MOCK` | Set to `1` to use a built-in sample catalog instead of IGDB — no credentials needed. Set to `0`/remove once real credentials are in place |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional — adds "Continue with Google" to the auth pages |
| `DATABASE_URL` | SQLite file location (default `file:./dev.db`, relative to `prisma/`) |

With `IGDB_MOCK=1` the app is fully usable out of the box: register an account, search for e.g. "zelda", and start logging.

### End-to-end smoke test

With the dev server running (and `IGDB_MOCK=1`):

```bash
node scripts/smoke.e2e.mjs
```

Drives a real Chromium session through register → search → log → edit → shelves → delete → sign out.

## Data model

- `User` — accounts (password hash nullable for OAuth users)
- `Game` — local cache of IGDB game data, created when a game is first logged/shelved
- `Platform` — platform list synced lazily from IGDB
- `PlayLog` — one row per finish (replays are separate entries, like a Letterboxd diary)
- `Shelf` / `ShelfItem` — custom collections

## Future ideas

- RetroAchievements / HowLongToBeat links on game pages (stub section already present)
- Public profiles and social features
- Magic-link email sign-in
- Postgres deployment (swap the Prisma datasource)
