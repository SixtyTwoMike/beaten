# QA & security test handover

Brief for an outside tester (human or AI agent) doing functional QA and a
security review of **Beaten**: a free, Letterboxd-style game diary.

- Live site: https://beaten.games (production, real users)
- Code: https://github.com/SixtyTwoMike/beaten (public), branch `feature/artwork-profiles`
- Stack: Next.js 16 App Router (server components + server actions),
  Auth.js v5 (JWT sessions; credentials + optional Google), Prisma 6 + SQLite,
  Tailwind v4. Hosted on one AWS Lightsail box (nginx → Node), London.

## Rules of engagement (read first)

1. **Do intrusive testing locally, not on production.** The live site is a
   $7/month instance with real users. Run the app locally (below) for fuzzing,
   brute force, injection payloads, high request rates and anything that
   writes a lot of data.
2. On **production**, only:
   - passive checks (headers, TLS, redirects, page source, public routes);
   - manual, low-rate testing with **accounts you create yourself**, using
     email addresses you control;
   - at most ~1 request per second; no scanners in aggressive mode, no
     load/DoS testing. nginx rate-limits sign-in and account forms (10/min/IP,
     returns 429): hitting that is expected, not a finding.
3. **Never** access, modify or enumerate other people's accounts or data
   beyond proving an issue exists (one request is enough; stop there).
4. Out of scope: AWS/Lightsail infrastructure, the SSH service, Hover DNS,
   iCloud mail, Resend, IGDB/Twitch, Google, Have I Been Pwned, and
   social engineering.
5. Don't put real secrets, other users' data or exploit chains in public
   places. Report privately (see "Reporting").

## Running locally

```bash
git clone https://github.com/SixtyTwoMike/beaten && cd beaten
git checkout feature/artwork-profiles
npm ci
cp .env.example .env            # then edit:
#   AUTH_SECRET=$(openssl rand -base64 32)
#   IGDB_MOCK=1                 # built-in sample game catalogue, no keys needed
npx prisma migrate deploy
IGDB_MOCK=1 npm run dev         # http://localhost:3000
```

- Emails aren't sent in dev: they're appended to `.dev-outbox/outbox.jsonl`
  (verification, reset and notification links are in there).
- End-to-end smoke test (Playwright, needs a Chrome/Chromium path):
  `CHROMIUM_PATH=/path/to/chrome node scripts/smoke.e2e.mjs`.
  It currently passes in full; it's a good map of the intended behaviour.
- Production build check: `npm run build && npm start`.

## Attack surface

**Public pages:** `/` (landing page when signed out), `/login`, `/register`,
`/forgot-password`, `/reset-password?token=`, `/verify-email?token=`,
`/support`, `/privacy`, `/u/<username>` (public profile),
`/.well-known/change-password` (redirects to settings).

**Signed-in pages:** `/` (dashboard), `/search`, `/games/<igdbId>`, `/log`
(diary with filters), `/shelves`, `/shelves/<id>`, `/settings`.

**Route handlers:**
- `/api/auth/*`: Auth.js (credentials callback, CSRF, session, Google OAuth)
- `GET /api/igdb/search?q=&platform=`: game search proxy (signed in)
- `GET /api/account/export?format=json|csv`: personal data export (signed in)

**Server actions** (POST to page URLs with a `Next-Action` header):
`registerUser`, `setUsername`, `signOutEverywhere`, `changePassword`
(`src/app/actions/auth.ts`); `requestPasswordReset`, `resetPassword`,
`verifyEmail`, `resendVerification`, `deleteAccount` (`account.ts`);
`saveLog`, `deleteLog` (`logs.ts`); `createShelf`, `deleteShelf`,
`addGameToShelf`, `removeGameFromShelf` (`shelves.ts`).

**Server-side support CLI** (`scripts/admin.ts`, run over SSH only; not
reachable from the web). Review the code; there's nothing to test remotely.

## Security design (so intended behaviour isn't reported as a bug)

- Passwords: 10–72 bytes, must include a letter, a digit and a symbol;
  rejected if found in Have I Been Pwned (k-anonymity range API; **fails
  open** if HIBP is down, by design). bcrypt cost 12.
- **Account enumeration resistance:** registering an existing email returns
  the same "check your email" response (the owner gets a notice email);
  forgot-password answers identically for unknown emails; sign-in for unknown
  emails runs a dummy bcrypt so timing matches. Emails are sent after the
  response (`after()`), so they don't affect timing either.
- Sessions: JWT cookie, 14-day max age, plus a per-user `tokenVersion` checked
  on every request. Password change, reset and "sign out everywhere" bump it,
  revoking all sessions.
- Email tokens (verify 24h, reset 30 min): 32 random bytes, stored as SHA-256,
  single use (atomic), other outstanding tokens voided on use; max 3 emails
  per account per kind per hour. Reset/verify pages send `Referrer-Policy:
  no-referrer`; verification needs a button POST (link scanners can't consume
  it).
- Unverified accounts can't sign in. Google sign-in requires
  `email_verified` and is **never** linked to an existing password account.
- Public profile selects only public fields (never email or hashes). Game
  pages need sign-in.
- Data export omits security fields; CSV escapes spreadsheet formulas.
- Account deletion requires the password (or typing the username for Google
  accounts) and cascades all data.
- nginx: overwrites `X-Forwarded-Host`; drops unknown Host headers (444);
  HTTP→HTTPS; HSTS; rate limits on credential POSTs and account-form POSTs.

## Known gaps (confirm and prioritise, no need to "discover" them)

- No `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`,
  `X-Content-Type-Options` or `Referrer-Policy` headers site-wide yet.
- No MFA/passkeys.
- `prisma` CLI has a build-time-only audit advisory (deepmerge-ts).
- Rate limiting is per-IP at nginx only; no per-account lockout for sign-in
  (relies on rate limit + bcrypt cost).

## What we'd like tested

### Security
- Authn/authz: IDOR on logs, shelves, shelf items, export; acting on another
  user's `logId`/`shelfId` via server actions; signed-out calls to actions
  and `/api/*`.
- Session handling: revocation after password change/reset/sign-out-
  everywhere/deletion; cookie flags; CSRF on Auth.js and server actions;
  open redirects (`callbackUrl`, `/login?…`).
- Token flows: reuse, expiry, cross-purpose use (verify token on reset),
  races (double submit), token leakage (Referer, logs, history).
- Enumeration: any difference (status, body, timing, emails) between known
  and unknown emails or usernames across register, login, forgot, resend.
- Injection: XSS via name, username, review text, shelf name/description,
  game data; CSV/formula injection in export; header injection in emails.
- Input limits: oversized fields, unicode/homoglyph usernames, password
  >72 bytes, malformed dates and ratings.
- Host/proxy: Host-header and `X-Forwarded-*` spoofing affecting links in
  emails or Auth.js redirects.
- TLS/headers review of https://beaten.games (passive).

### Functional QA
- Register → verify email → sign in → log games (playing / beaten /
  mastered, replays, half-star ratings, reviews, dates) → shelves → diary
  filters → public profile → export → change password → delete account.
- Landing page coverflow (desktop, phone, `prefers-reduced-motion`).
- Password managers on iPhone (Safari + iCloud Keychain, generated "strong
  password") and Android (Chrome + Google Password Manager): save on
  register, fill on sign-in, update on change/reset.
- Phone layouts (no horizontal scroll, no zoom on focus), keyboard-only use,
  screen-reader labels, colour contrast.
- Error states: IGDB down, expired links, 429s, empty states.

## Reporting

One markdown file of findings, most severe first. For each:

- **Title**, **severity** (Critical / High / Medium / Low / Info) and why
- **Where:** URL or `file:line`
- **Steps to reproduce** (local or production, which account(s))
- **Expected vs actual**
- **Suggested fix**

Mark anything found on production clearly, and say if it touched data that
wasn't yours. Send to support@beaten.games; don't open public GitHub issues
for security findings.
