# Beaten for iPhone — test plan

For each TestFlight build before it goes to App Review, and again for any
release that touches sign-in, logging or the API. Run on a real iPhone with
the TestFlight build (it talks to beaten.games), with the web app open
alongside to check that both sides agree.

Tick as you go; note the build number at the top of the run. Anything marked
**(review)** is something App Review is known to check.

## What's automated already

| Check | Where | Covers |
| --- | --- | --- |
| API smoke | `node scripts/api.smoke.mjs` (dev server) | every `/api/v1` endpoint, auth errors, idempotent create, following, reactions, comments, blocking, account deletion |
| Web smoke | `scripts/smoke.e2e.mjs` | the web app, including the actions now shared with the API |
| Social UI | `SocialTests.testSocial` | feed, spoiler reveal, react, comment and delete, profile, unfollow/follow, people search | `scripts/smoke.e2e.mjs` | the web app, including the actions now shared with the API |
| UI walkthrough | `WalkthroughTests.testCoreLoop` | sign in, search, log, game page, diary delete, shelves, profile |
| Screenshots | `ScreenshotTests` | the App Store screens render with a full diary |
| Apple token checks | offline, 8 cases | nonce, audience, expiry, issuer, unverified email, unknown key, tampering |

So the manual pass concentrates on what those can't see: real Apple
sign-in, a real network, the device, and the web and app agreeing.

## 1. Install and first launch

- [ ] Installs from TestFlight; icon and name look right on the home screen.
- [ ] First launch shows the sign-in screen, no flash of the signed-in UI.
- [ ] Links to Create account and Forgot password open beaten.games in Safari.

## 2. Signing in

Password:
- [ ] Right email and password → Home loads with your stats.
- [ ] Wrong password → a clear error, stays on sign-in.
- [ ] Unconfirmed address (register on the web, don't click the link) → told to confirm the email, not "wrong password".
- [ ] Ten wrong passwords in a row → still a plain error (after a few, the server stops checking and nginx may answer "too many requests"); no crash, and the right password works again after a few minutes.

Sign in with Apple **(review)**:
- [ ] New Apple ID, **share** email → a new account; the same account when signing in on the web with Apple.
- [ ] New Apple ID, **Hide My Email** → signs in; then sign in on the web with Apple and confirm it's the **same** account (same diary). If you get two accounts, the App ID grouping with `games.beaten.web` is wrong.
- [ ] Apple ID whose email already has a **confirmed password** account → refused with a message saying to use the password (409), no second account.
- [ ] Cancel the Apple sheet → back to sign-in, no error banner.

Staying signed in:
- [ ] Force-quit and reopen → still signed in.
- [ ] Restart the phone, unlock, open → still signed in.

## 3. Search

- [ ] Typing searches after a short pause; results show covers and years.
- [ ] Platform filter narrows results.
- [ ] Nonsense query → an empty state, not an error.
- [ ] Airplane mode, then search → an offline message; turning it off and searching again works.

## 4. Logging

For each status (Playing, Beaten, Mastered, Shelved):
- [ ] Log from search with the + menu; it appears on Home and in the Diary, and on the web after a refresh.
- [ ] Log from the game page with Log again.

Fields:
- [ ] Platform picker lists the game's own platforms first.
- [ ] Finished date at each precision: exact day, month, year only. Check the web shows the same ("Jul 2026", "2026").
- [ ] "I don't remember when I finished it" hides the dates and saves with no finish date; it shows in the Diary's unknown-date group.
- [ ] Shelved: Put down date and "Not going back to it" save.
- [ ] Half-star rating by dragging; Clear removes it; VoiceOver can adjust it by swiping up and down.
- [ ] Review with spoilers ticked → the web hides it behind a spoiler warning.
- [ ] Add to an existing shelf and to a new shelf typed in the sheet.
- [ ] Replay toggle saves.

Editing and deleting:
- [ ] Edit an entry (swipe in the Diary, or Edit on the game page); changes show on the web.
- [ ] Delete an entry; gone from Home, Diary and the web.

Bad network **(where duplicates would show)**:
- [ ] Turn on Network Link Conditioner (Very Bad Network, in Settings > Developer), log a game, and if it fails tap Save again → exactly **one** entry.
- [ ] Airplane mode on, Save → an error in the sheet; the sheet stays open with everything you typed.

## 5. Library (Diary and Shelves) and Home

- [ ] Diary groups match the web's (by finish date, unknown date, shelved).
- [ ] Filter menu narrows by status.
- [ ] Pull to refresh picks up an entry made on the web meanwhile.
- [ ] Home stats (playing, beaten, mastered, finished this year) match the web dashboard.

## 6. Shelves

- [ ] Create a shelf with and without a description.
- [ ] Open a shelf; long-press a game → Remove from shelf.
- [ ] Delete a shelf; its games stay in the Diary.
- [ ] Shelf chips on a game page add and remove it.

## 6b. Activity, following and comments

Use two accounts (yours and a throwaway), one on the web and one in the app.

- [ ] Activity > Following shows what people you follow logged, newest first; scrolling to the end loads older cards.
- [ ] Spoiler reviews are blurred until tapped.
- [ ] React from the ☺ menu; the chip appears with a count, tapping it again removes it. The web shows the same count.
- [ ] Comment from the app; it shows on the web under the review and vice versa.
- [ ] Swipe to delete your own comment; the review's author can delete anyone's comment on their review.
- [ ] Long-press a comment > Report comment opens Mail to support with the comment quoted **(review)**.
- [ ] Profile > Find people finds the other account by name or username.
- [ ] Their profile: Follow / Following (unfollow asks first); counts update on both sides.
- [ ] ⋯ > Block: the follow ends both ways, their cards and comments disappear, and they can't follow or comment on you **(review)**. Unblock brings the button back.
- [ ] New followers show as a badge on the Profile tab; opening Followers clears it.

## 7. Profile and account

- [ ] Avatar and name match the web; Share opens the share sheet with your profile link.
- [ ] Signed-in devices lists this phone (marked) and any web-issued app sessions; signing another device out works.
- [ ] Sign out everywhere on the **web** (Settings > Sessions) → the app drops to sign-in on its next request.
- [ ] Export → the share sheet offers a JSON file; open it in Files and check it has your logs.
- [ ] Privacy, Terms, Support and IGDB credit links open the right pages.

Delete account **(review)**:
- [ ] Password account: wrong password → error; right password → signed out, account gone (sign-in on the web fails), goodbye email arrives.
- [ ] Apple account: typing the username or email confirms.
- [ ] Use a throwaway account for this, never the App Review demo account.

## 8. Device and accessibility

- [ ] Smallest supported phone (iPhone 17e, or the simulator) — no clipped buttons in the Log sheet or Home stats.
- [ ] Largest Dynamic Type size — text wraps, nothing overlaps, Save stays reachable.
- [ ] VoiceOver: sign in, search, log a game and rate it without looking.
- [ ] Bold Text and Reduce Transparency on — still readable.
- [ ] Light mode on the phone — the app stays dark and readable (it forces dark).

## 9. Before submitting

- [ ] App Review demo account (`REVIEW_DEMO_USER` in `ios/fastlane/.env`) signs in on this build and has a few logs, so the reviewer sees a filled-in app.
- [ ] `fastlane metadata` ran with the review contact details filled in.
- [ ] App Privacy answers and price set in App Store Connect.
- [ ] Real icon in place; version and build number as expected in TestFlight.

## Logging issues

Note the build number, the steps, what you expected and what happened, and
a screen recording if it's visual. For anything server-side, the time
(to the minute) lets the server logs be matched up.
