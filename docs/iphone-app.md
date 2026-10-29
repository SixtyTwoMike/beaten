# Beaten for iPhone — plan

Status: **built; API live on beaten.games (179cdcb, 2026-10-29)**, branch `feature/ios-app`. v1 is the
logging app: sign in, search, log, diary, shelves, your own profile. Social
(feed, following, people), imports (Steam, RetroAchievements) and Console
Chronicles stay web-only for now. iOS 26+, iPhone only.

## Running it

```bash
# server: the dev server must be running (npm run dev)
node scripts/api.smoke.mjs              # every /api/v1 endpoint, throwaway account

# app (XcodeGen: edit ios/project.yml, never the .xcodeproj)
cd ios && xcodegen generate && open Beaten.xcodeproj
```

Debug builds talk to `http://localhost:3000`, Release to `https://beaten.games`
(`BEATEN_API_BASE` in `project.yml`). The UI walkthrough test signs in with
a dev-database account and logs, checks and deletes a game:

```bash
cd ios && TEST_RUNNER_BEATEN_TEST_EMAIL=you@example.com TEST_RUNNER_BEATEN_TEST_PASSWORD=… \
  xcodebuild test -project Beaten.xcodeproj -scheme Beaten \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO
```

## Shape

```
iPhone (SwiftUI) ──HTTPS + bearer token──▶ beaten.games/api/v1/*  (route handlers, JSON)
                                                │
                                                ├─ src/lib/* (same Prisma models, IGDB client,
                                                │             validation as the web app)
                                                └─ SQLite on the Lightsail box
```

The web app writes through **server actions**, which aren't a stable API for
a native client. The logic in `src/app/actions/{logs,shelves}.ts` (and
`deleteAccount` in `account.ts`) moves into plain functions in `src/lib/`
that take a `userId`, e.g. `saveLogForUser(userId, input)`. Server actions
and `/api/v1` handlers become thin wrappers, so validation, ownership checks
and side effects such as `recordLogActivity` live in one place. Logs made on
the phone still show in followers' web feeds.

The Swift code lives in this repo at `ios/`, so API and app changes land in
the same commits.

## Identifiers

| What | Value |
| --- | --- |
| App bundle ID | `games.beaten.app` |
| Web Sign in with Apple (Services ID, `APPLE_CLIENT_ID`) | `games.beaten.web` (existing) |
| Widget / extensions (later) | `games.beaten.app.<name>` |

These don't clash. In the developer portal the App ID `games.beaten.app`
needs the Sign in with Apple capability, **grouped with the same primary App
ID as the `games.beaten.web` Services ID**. Apple then gives a user the same
`sub` and the same private-relay email on the web and in the app. Accounts
are matched by verified email (`src/lib/auth.ts`), so without the grouping a
"Hide My Email" user would get a second account in the app.

## Auth

Bearer tokens, not the web's Auth.js cookie session.

- `POST /api/v1/auth/login` `{email, password}` → `{token, user}`. Same
  bcrypt, attempt limiting (`rate-limit.ts`) and unverified-email rule as
  the web Credentials provider.
- `POST /api/v1/auth/apple` `{identityToken, name?}` → `{token, user}`. The
  server checks the JWT against Apple's JWKS: `iss`, `aud` (bundle ID,
  `APPLE_APP_BUNDLE_ID`), `exp`, and a nonce the app sent. It then uses
  the same verified-email rules as the web `signIn` callback, shared from
  one function.
- `POST /api/v1/auth/logout` revokes the current token.
- Registration and password reset stay on the web for v1. The app links to
  them, then you sign in.
- Tokens: 32 random bytes, returned once. Only a SHA-256 hash is stored in
  `ApiToken {id, userId, tokenHash, name, createdAt, lastUsedAt, expiresAt}`.
  Tokens expire after 90 days of no use. "Sign out everywhere" (the
  `tokenVersion` bump) voids them too. A user can have 20 at most; signing in
  on another drops the least recently used. The app lists signed-in devices.
- `requireApiUser(request)` in `src/lib/session.ts` resolves the token,
  like `requireUserId()` does for actions.
- iOS keeps the token in the **Keychain**
  (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`), never UserDefaults.
- nginx rate-limits all of `/api/v1/*`, tighter on `/api/v1/auth/*`. This
  avoids the gap from review finding #1, where only some paths were
  limited.

## API surface (v1)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/me` | profile, avatar, stats (same numbers as the dashboard) |
| GET | `/api/v1/logs` | the whole diary; the app filters and groups locally |
| POST | `/api/v1/logs` | create; body = `SaveLogInput` + client `id` |
| PATCH | `/api/v1/logs/:id` | edit |
| DELETE | `/api/v1/logs/:id` | |
| GET | `/api/v1/games/search?q=&platform=` | wraps the IGDB search |
| GET | `/api/v1/games/:igdbId` | details, artwork, the user's logs for it |
| GET/POST | `/api/v1/shelves` | list / create |
| DELETE | `/api/v1/shelves/:id` | |
| POST/DELETE | `/api/v1/shelves/:id/games/:igdbId` | add / remove |
| GET | `/api/v1/platforms` | for pickers; cacheable |
| GET | `/api/v1/account/export` | same JSON as the web export |
| DELETE | `/api/v1/account` | App Store requires in-app deletion |
| GET | `/api/v1/devices` | signed-in devices, this one marked |
| DELETE | `/api/v1/devices/:id` | sign a device out |
| POST | `/api/v1/auth/login`, `/auth/apple`, `/auth/logout` | see Auth |

JSON uses partial ISO dates (`YYYY-MM-DD`, `YYYY-MM` or `YYYY`, as
`parsePartialDate` accepts), ratings as 1–10 half stars, and the status
strings from `src/lib/status.ts`. Errors use `{error: string}` with a proper
HTTP status.

**Idempotent creates:** `POST /logs` takes a client-generated cuid/UUID as
the id. A retry after a dropped connection returns the existing log instead
of making a duplicate, so an offline queue can be added later without
changing the API.

## iOS app (SwiftUI)

```
ios/Beaten/
  App/      BeatenApp.swift (tabs), AppModel.swift (@Observable session,
            diary, shelves, platforms; every write goes through it)
  API/      APIClient.swift (async/await URLSession, bearer header,
            401 → sign-out), Models.swift (Codable, PartialDate)
  Auth/     Keychain.swift, SignInView (email/password + Sign in with Apple)
  Features/
    Home/     stats + Currently playing + Recently finished
    Search/   debounced search, platform filter, quick-log buttons
    Log/      LogSheet: Playing / Beaten / Mastered / Shelved, partial
              dates, half-star rating, review, spoilers, shelves
              (mirrors LogGameModal)
    Diary/    filters, swipe to edit/delete
    Shelves/
    Profile/  own profile, avatar, share link to beaten.games/<username>
    Settings/ devices, export, delete account, links to privacy/terms/support
  Design/   Logo (Futura, tracked caps), colours from globals.css @theme
```

Reuse from eist where it fits: Keychain helper, Futura type setup, App
Store/TestFlight pipeline.

## Build order

1. ✅ Extract log/shelf/account/sign-in logic into `src/lib`; actions are
   wrappers. Web smoke test passes.
2. ✅ `ApiToken` migration, `requireApiUser`, `/api/v1/auth/*` (password +
   Apple), nginx limits (not yet tested on a real nginx).
3. ✅ `/api/v1` endpoints; `scripts/api.smoke.mjs`.
4. ✅ App: sign-in, Home, Search, Log sheet, Game, Diary, Shelves, Profile,
   devices, export, delete account; UI walkthrough test.
5. ✅ Deploy the server (`api_tokens` migration applied, nginx `-t` passes).
6. Developer portal: App ID `games.beaten.app` with Sign in with Apple,
   grouped with the web Services ID; App Store Connect record; real app
   icon (the current one is a placeholder).
7. TestFlight: copy `ios/fastlane/.env.example` to `.env` (same API key as
   éist), then `cd ios && fastlane beta`. Then App Store review.

## Later

Activity feed and following (needs report/block in-app for review),
universal links, Currently Playing widget, Siri ("Mark Hades as beaten"),
native share cards, offline queue, Steam/RA import, Console Chronicles.
