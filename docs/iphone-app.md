# Beaten for iPhone — architecture sketch

Status: **plan / scaffold**. Nothing here is built yet. The auth section waits
on the security review of the web login before any code lands.

## Shape

```
iPhone (SwiftUI) ──HTTPS──▶ /api/v1/*  (Next.js route handlers, JSON)
                                │
                                ├─ src/lib/* (same Prisma models, IGDB client,
                                │             validation as the web app)
                                └─ SQLite on the Lightsail box
```

The web app currently mutates data via **server actions**, which are not a
stable API for a native client. The plan is to pull the logic out of
`src/app/actions/{logs,shelves}.ts` into plain functions in `src/lib/`
(`saveLogForUser(userId, input)`, etc.). Server actions and `/api/v1` route
handlers then become thin wrappers around them, so validation and ownership
checks live in one place.

Prerequisite: **HTTPS**. A phone app must not send passwords or tokens over
the plain-HTTP deploy. Point a domain at the Lightsail static IP and run
certbot (see `deploy/README.md`) before shipping the app.

## Auth (pending security review)

Use bearer tokens, not the web's Auth.js cookie session.

- `POST /api/v1/auth/login` `{email, password}` → `{token, user}`
- `POST /api/v1/auth/register` → same, reusing `registerUser` validation
- `POST /api/v1/auth/logout` revokes the current token
- Tokens: 32 random bytes, returned once. Only a SHA-256 hash is stored in a
  new `ApiToken {id, userId, tokenHash, name, createdAt, lastUsedAt, expiresAt}`
  table, so a leaked DB doesn't leak usable tokens, and tokens can be revoked
  one device at a time ("Signed-in devices" in Settings).
- iOS stores the token in the **Keychain**
  (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`), never UserDefaults.
- Later: Sign in with Apple (required by App Store review if Google sign-in is
  offered in the app), and passkeys via the web's associated domain.

`requireApiUser(request)` in `src/lib/session.ts` resolves the bearer token,
which mirrors `requireUserId()` for actions.

## API surface (v1)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/me` | profile + stats (same numbers as dashboard) |
| GET | `/api/v1/logs?status=&platform=&year=&cursor=` | diary, paginated |
| POST | `/api/v1/logs` | create; body = `SaveLogInput` |
| PATCH | `/api/v1/logs/:id` | edit |
| DELETE | `/api/v1/logs/:id` | |
| GET | `/api/v1/games/search?q=&platform=` | wraps existing IGDB search |
| GET | `/api/v1/games/:igdbId` | details + artwork + the user's logs for it |
| GET/POST | `/api/v1/shelves` | list / create |
| POST/DELETE | `/api/v1/shelves/:id/games/:igdbId` | add / remove |
| GET | `/api/v1/platforms` | for pickers; cacheable |
| GET | `/api/v1/users/:username` | public profile JSON, no auth |

JSON uses ISO dates (`YYYY-MM-DD` for start/finish), ratings as 1–10 half
stars, and the status strings from `src/lib/status.ts`. Errors use
`{error: string}` with a proper HTTP status.

## iOS app (SwiftUI, iOS 18+)

```
ios/Beaten/
  BeatenApp.swift
  API/      APIClient.swift (async/await URLSession, bearer header,
            401 → sign-out), Endpoints.swift, Models.swift (Codable)
  Auth/     KeychainStore.swift, SessionStore.swift (@Observable)
  Features/
    Home/     stats + Currently playing + Recently finished
    Search/   debounced search, platform filter, quick-log buttons
    Log/      LogSheet: Playing/Beaten/Mastered, dates, half-star
              rating, review, shelves (mirrors LogGameModal)
    Diary/    filters, swipe to edit/delete
    Shelves/
    Profile/  own public profile + share link (/u/<username>)
  Design/   Logo (Futura, tracked caps), colours from globals.css @theme
```

Good fits for a native app once the basics work:
- **Share sheet / universal links**: `/u/<username>` and `/games/<id>` open
  in the app.
- **Widget**: Currently playing (cover art + "since" date).
- **App Intent / Siri**: "Mark Hades as beaten".
- **Offline queue**: logs made without signal sync later (the API should
  accept a client-generated id to make retries idempotent).

## Build order

1. HTTPS on the deploy.
2. Extract action logic into `src/lib`; add `ApiToken` + `requireApiUser`.
3. `/api/v1` read endpoints + public profile JSON; extend the smoke test with
   API calls.
4. Xcode project: auth + Home + Search + Log sheet (the core loop).
5. Diary, Shelves, Profile, then widget and share-link handling.
