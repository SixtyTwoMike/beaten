// End-to-end smoke test against the dev server (IGDB_MOCK=1).
// Emails are read from the dev outbox the app writes in development.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
const email = `smoke-${Date.now()}@example.com`;
// Unique per run so it can't appear in the breached-password corpus.
let password = `Smoke!${Date.now()}x`;
const username = `smoke_${Date.now().toString(36)}`;
const shots = process.env.SMOKE_SHOTS_DIR || "/tmp";

// 1×1 PNG, standing in for IGDB art in mock mode.
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const OUTBOX = new URL("../.dev-outbox/outbox.jsonl", import.meta.url);

async function outbox() {
  const raw = await readFile(OUTBOX, "utf8").catch(() => "");
  return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

// Waits for an email to `to` whose subject contains `subject`, sent after
// `since` (emails are sent in the background after the response).
async function waitForEmail(to, subject, since) {
  for (let i = 0; i < 50; i++) {
    const found = (await outbox()).find(
      (m) => m.to === to && m.subject.includes(subject) && m.sentAt >= since
    );
    if (found) return found;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no "${subject}" email to ${to}`);
}

function linkIn(mail, pathname) {
  const match = mail.text.match(new RegExp(`https?://\\S+${pathname}\\?token=\\S+`));
  if (!match) throw new Error(`no ${pathname} link in "${mail.subject}"`);
  return match[0];
}

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}`);
  if (!cond) failures++;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(15000);

try {
  // 1. Signed out, / is the landing page; app pages redirect to /login
  await page.goto(`${BASE}/`);
  check("landing page headline", await page.getByRole("heading", { level: 1, name: /Every game/ }).isVisible());
  check("landing page has sign in and register",
    (await page.getByRole("link", { name: "Sign in" }).isVisible()) &&
    (await page.getByRole("link", { name: "Create account" }).isVisible()));
  check("landing coverflow shows covers", (await page.locator('[aria-hidden="true"] [role="img"], [aria-hidden="true"] img').count()) >= 7);
  await page.screenshot({ path: `${shots}/landing.png` });
  await page.goto(`${BASE}/log`);
  await page.waitForURL("**/login");
  check("unauthenticated app page redirects to /login", page.url().includes("/login"));

  // 1b. Password managers' change-password URL
  const wk = await page.request.get(`${BASE}/.well-known/change-password`, { maxRedirects: 0 });
  check("/.well-known/change-password redirects to settings",
    wk.status() === 307 && (wk.headers().location ?? "").endsWith("/settings#password"));

  // 2. Register — first assert the Apple/keychain autofill attributes
  await page.goto(`${BASE}/register`);
  check(
    "register email has autocomplete=username",
    (await page.getAttribute("#register-email", "autocomplete")) === "username"
  );
  check(
    "register password has autocomplete=new-password",
    (await page.getAttribute("#register-password", "autocomplete")) === "new-password"
  );
  check(
    "register password exposes passwordrules",
    (await page.getAttribute("#register-password", "passwordrules"))?.includes("minlength")
  );
  check(
    "register password has a name attribute",
    Boolean(await page.getAttribute("#register-password", "name"))
  );
  await page.fill('input[placeholder="Display name"]', "Smoke Tester");
  await page.fill("#register-username", username.toUpperCase());
  await page.fill('input[placeholder="Email"]', email);
  // Display names go into emails to unconfirmed addresses: no links.
  await page.fill("#register-password", password);
  await page.fill('input[placeholder="Display name"]', "https://evil.example/login");
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Display names can't contain links");
  check("display name with a link rejected", true);
  await page.fill('input[placeholder="Display name"]', "Smoke Tester");
  // Password rules are enforced server-side, not just by the checklist.
  await page.fill("#register-password", "abcdefghij");
  check(
    "password checklist flags missing number/symbol",
    (await page.locator('#register-password-rules li[data-met="false"]').count()) === 2
  );
  await page.locator("#register-password").evaluate((el) => el.removeAttribute("minlength"));
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Password needs");
  check("weak password rejected by server", true);
  await page.fill("#register-password", "Password123!");
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=appeared in a data breach");
  check("breached password rejected", true);
  await page.fill("#register-password", password);
  const registeredAt = new Date().toISOString();
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Check your email");
  check("register asks to confirm email", true);
  check("unconfirmed sign-up doesn't claim its username",
    (await page.request.get(`${BASE}/${username}`)).status() === 404);

  // 2b. Can't sign in until the address is confirmed
  await page.goto(`${BASE}/login`);
  await page.fill("#login-email", email);
  await page.fill("#login-password", password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForSelector("text=Please confirm your email");
  check("unverified account can't sign in", true);

  // 2c. Registering an existing email looks identical, but emails the owner
  const dupContext = await browser.newContext();
  const dup = await dupContext.newPage();
  await dup.goto(`${BASE}/register`);
  await dup.fill("#register-name", "Impostor");
  await dup.fill("#register-username", `${username}_2`);
  await dup.fill("#register-email", email);
  await dup.fill("#register-password", `Other#${Date.now()}z`);
  await dup.click('button[type="submit"]');
  await dup.waitForSelector("text=Check your email");
  check("duplicate email registration gives the same response", true);
  check("duplicate registration leaves no public trace",
    (await page.request.get(`${BASE}/${username}_2`)).status() === 404);
  await dupContext.close();
  await waitForEmail(email, "already have a Beaten account", registeredAt);
  check("existing owner is emailed about the attempt", true);

  // 2d. Confirm via the emailed link, then sign in
  const verifyMail = await waitForEmail(email, "Confirm your email", registeredAt);
  await page.goto(linkIn(verifyMail, "/verify-email"));
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await page.waitForURL("**/login?verified=1");
  check("verification link confirms the email", await page.getByText("Email confirmed").isVisible());
  await page.fill("#login-email", email);
  await page.fill("#login-password", password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(BASE + "/");
  check("register lands on dashboard", await page.getByRole("heading", { name: "Welcome back, Smoke Tester" }).isVisible());
  await page.screenshot({ path: `${shots}/01-dashboard-empty.png` });

  // 3. Search (mock catalog) with platform filter
  await page.goto(`${BASE}/search`);
  await page.fill('input[type="search"]', "zelda");
  await page.waitForSelector("text=The Legend of Zelda: Breath of the Wild");
  check("search finds BotW", true);
  // Platform filter: SNES should exclude both Zeldas
  await page.selectOption('select[aria-label="Filter by platform"]', { label: "Super Nintendo Entertainment System" });
  await page.waitForSelector("text=No games found", { timeout: 10000 });
  check("platform filter excludes non-SNES results", true);
  await page.selectOption('select[aria-label="Filter by platform"]', "");
  await page.waitForSelector("text=Ocarina of Time");
  await page.screenshot({ path: `${shots}/02-search.png` });

  // 4. Log BotW as Beaten with rating, review, dates, new shelf
  const botwCard = page.locator("div.group", { hasText: "Breath of the Wild" }).first();
  await botwCard.getByRole("button", { name: "Beaten", exact: true }).click();
  await page.waitForSelector("text=Add to your played log");
  await page.selectOption("#log-platform", { label: "Nintendo Switch" });
  await page.fill("#log-started", "2026-06-01");
  await page.fill("#log-finished", "2026-07-01");
  // 4.5 stars = 9 half-steps
  await page.getByRole("radio", { name: "4.5 stars" }).click();
  await page.fill("#log-review", "An open world that actually trusts the player. Masterpiece.");
  await page.fill('input[placeholder="+ New shelf name"]', "All-timers");
  await page.getByRole("button", { name: "Save log" }).click();
  await page.waitForSelector("text=Add to your played log", { state: "detached" });
  check("log saved (modal closed)", true);
  await page.screenshot({ path: `${shots}/03-search-after-log.png` });

  // 5. Log Super Metroid as Mastered (replay)
  await page.fill('input[type="search"]', "metroid");
  await page.waitForSelector("text=Super Metroid");
  const smCard = page.locator("div.group", { hasText: "Super Metroid" }).first();
  await smCard.getByRole("button", { name: "100%", exact: true }).click();
  await page.waitForSelector("text=Add to your played log");
  // switch status to Mastered inside the modal (card button opens it on MASTERED already)
  await page.getByRole("button", { name: "Replay" }).click();
  await page.getByRole("radio", { name: "5 stars", exact: true }).click();
  await page.getByRole("button", { name: "Save log" }).click();
  await page.waitForSelector("text=Add to your played log", { state: "detached" });

  // 6. Dashboard shows stats + recent
  await page.goto(`${BASE}/`);
  await page.waitForSelector("text=Recently finished");
  const beatenStat = await page.locator("div", { hasText: /^2Games beaten$/ }).count();
  check("dashboard shows 2 games beaten", beatenStat > 0);
  check("dashboard shows mastered badge", await page.getByText("★ Mastered").first().isVisible());
  await page.screenshot({ path: `${shots}/04-dashboard.png` });

  // 7. Diary shows entries, review text; filter by status
  await page.goto(`${BASE}/log`);
  await page.waitForSelector("text=Diary");
  check("diary shows BotW review", await page.getByText("trusts the player").isVisible());
  check("diary shows replay tag", await page.getByText("↻ Replay").isVisible());
  await page.selectOption('select[name="status"]', "MASTERED");
  await page.click('button:has-text("Filter")');
  await page.waitForSelector("text=Super Metroid");
  check("status filter hides beaten-only game", !(await page.getByText("Breath of the Wild").isVisible().catch(() => false)));
  await page.screenshot({ path: `${shots}/05-diary-filtered.png` });

  // 7b. A game beaten long ago, date forgotten: its own diary section,
  // counted as beaten but not for any year
  await page.goto(`${BASE}/search`);
  await page.fill('input[type="search"]', "chrono");
  await page.waitForSelector("text=Chrono Trigger");
  await page.locator("div.group", { hasText: "Chrono Trigger" }).first()
    .getByRole("button", { name: "Beaten", exact: true }).click();
  await page.waitForSelector("text=Add to your played log");
  await page.check("#log-date-unknown");
  check("unknown date hides the date fields", (await page.locator("#log-finished").count()) === 0);
  await page.getByRole("button", { name: "Save log" }).click();
  await page.waitForSelector("text=Add to your played log", { state: "detached" });
  await page.goto(`${BASE}/log`);
  const whileAgo = page.locator("section", { has: page.getByRole("heading", { name: /Finished a while ago/ }) });
  check("diary lists undated finishes separately",
    await whileAgo.locator("li", { hasText: "Chrono Trigger" }).getByText("Finished, date unknown").isVisible());
  await page.goto(`${BASE}/`);
  check("undated finish counts as beaten", (await page.locator("div", { hasText: /^3Games beaten$/ }).count()) > 0);
  check("undated finish isn't counted for this year",
    (await page.locator("div", { hasText: new RegExp(`^2Finished in ${new Date().getUTCFullYear()}$`) }).count()) > 0);

  // 7c. Putting a game down: Shelved (not going back) leaves Playing and the
  // totals alone and gets its own diary section
  await page.goto(`${BASE}/search`);
  await page.fill('input[type="search"]', "celeste");
  await page.waitForSelector("text=Celeste");
  await page.locator("div.group", { hasText: "Celeste" }).first()
    .getByRole("button", { name: "Playing", exact: true }).click();
  await page.waitForSelector("text=Add to your played log");
  await page.getByRole("button", { name: "❚❚ Shelved" }).click();
  check("shelving asks when it was put down, not finished",
    (await page.locator("#log-stopped").count()) === 1 && (await page.locator("#log-finished").count()) === 0);
  // Started: just a month
  await page.locator('[aria-label="How exact"]').first().getByRole("button", { name: "Month" }).click();
  await page.selectOption("#log-started", "02");
  await page.selectOption('select[aria-label="Year"]', "2026");
  await page.fill("#log-stopped", "2026-03-04");
  await page.check("#log-not-returning");
  await page.getByRole("button", { name: "Save log" }).click();
  await page.waitForSelector("text=Add to your played log", { state: "detached" });
  await page.goto(`${BASE}/log`);
  const shelvedSection = page.locator("section", { has: page.getByRole("heading", { name: /^Shelved/ }) });
  const shelvedRow = shelvedSection.locator("li", { hasText: "Celeste" });
  check("diary lists shelved games separately",
    await shelvedRow.getByText("Mar 4, 2026").isVisible());
  check("a month-only start date shows as just the month",
    await shelvedRow.getByText("Feb 2026 – Mar 4, 2026").isVisible());
  check("shelved game shows 'Not going back'", await shelvedRow.getByText("Not going back").isVisible());
  await page.goto(`${BASE}/log?status=SHELVED`);
  check("status filter finds shelved games", await page.getByText("Celeste").first().isVisible());
  await page.goto(`${BASE}/`);
  check("shelved game isn't counted as beaten", (await page.locator("div", { hasText: /^3Games beaten$/ }).count()) > 0);

  // 7d. Finished, but only the year remembered: still counts for that year
  const thisYear = String(new Date().getUTCFullYear());
  await page.goto(`${BASE}/search`);
  await page.fill('input[type="search"]', "hollow");
  await page.waitForSelector("text=Hollow Knight");
  await page.locator("div.group", { hasText: "Hollow Knight" }).first()
    .getByRole("button", { name: "Beaten", exact: true }).click();
  await page.waitForSelector("text=Add to your played log");
  await page.locator('[aria-label="How exact"]').nth(1).getByRole("button", { name: "Year" }).click();
  check("finish date can be just a year", (await page.locator("select#log-finished").inputValue()) === thisYear);
  await page.getByRole("button", { name: "Save log" }).click();
  await page.waitForSelector("text=Add to your played log", { state: "detached" });
  await page.goto(`${BASE}/log`);
  check("year-only finish shows as just the year",
    await page.locator("li", { hasText: "Hollow Knight" }).locator("span.whitespace-nowrap", { hasText: new RegExp(`^${thisYear}$`) }).isVisible());
  await page.goto(`${BASE}/`);
  check("year-only finish counts towards that year",
    (await page.locator("div", { hasText: new RegExp(`^3Finished in ${thisYear}$`) }).count()) > 0);

  // 8. Edit a log (change rating)
  await page.goto(`${BASE}/log`);
  const entry = page.locator("li", { hasText: "Breath of the Wild" }).first();
  await entry.getByRole("button", { name: "Edit" }).click();
  await page.waitForSelector("text=Edit log entry");
  await page.getByRole("radio", { name: "5 stars", exact: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForSelector("text=Edit log entry", { state: "detached" });
  check("edit log saved", true);

  // 9. Shelves: All-timers exists with BotW; create + delete another shelf
  await page.goto(`${BASE}/shelves`);
  await page.waitForSelector("text=All-timers");
  check("shelf created from log modal exists", true);
  await page.click("text=All-timers");
  await page.waitForSelector("text=Breath of the Wild");
  check("BotW is on the shelf", true);
  await page.screenshot({ path: `${shots}/06-shelf.png` });
  await page.goto(`${BASE}/shelves`);
  await page.waitForSelector('input[placeholder^="New shelf name"]');
  await page.fill('input[placeholder^="New shelf name"]', "Backlog Someday");
  await page.getByRole("button", { name: "Create shelf" }).click();
  await page.waitForSelector("text=Backlog Someday");
  check("second shelf created", await page.getByText("Backlog Someday").isVisible());

  // 10. Game detail page + "currently playing" flow
  await page.goto(`${BASE}/search`);
  await page.fill('input[type="search"]', "hades");
  await page.waitForSelector("text=Hades");
  await page.click('a:has-text("Hades")');
  await page.waitForSelector("text=I've beaten this");
  check("game detail shows beaten button", true);
  check("game detail shows playing button", await page.getByText("I'm playing this").isVisible());
  check("game detail shows external links stub", await page.getByText("RetroAchievements").isVisible());
  // Shelve a game straight from its page, no log entry needed
  await page.getByRole("button", { name: "+ Backlog Someday" }).click();
  await page.getByRole("button", { name: "✓ Backlog Someday" }).waitFor();
  await page.reload();
  check("game page adds to a shelf directly",
    (await page.getByRole("button", { name: "✓ Backlog Someday" }).getAttribute("aria-pressed")) === "true");
  // Out-of-range ids and filters are a 404 / ignored, not a 500
  check("oversized game id is a 404", (await page.request.get(`${BASE}/games/2147483648`)).status() === 404);
  check("bad diary filters are ignored",
    (await page.request.get(`${BASE}/log?year=999999&platform=1.5`)).status() === 200);
  await page.screenshot({ path: `${shots}/07-game-detail.png` });

  // 10a. Mark Hades as currently playing (no finish date)
  await page.getByRole("button", { name: "I'm playing this" }).click();
  await page.waitForSelector("text=Add to your played log");
  check("playing modal hides the finish-date field", (await page.locator("#log-finished").count()) === 0);
  await page.fill("#log-started", "2026-06-15");
  await page.getByRole("button", { name: "Save log" }).click();
  await page.waitForSelector("text=Add to your played log", { state: "detached" });

  // 10b. Dashboard "Currently playing" section shows Hades
  await page.goto(`${BASE}/`);
  await page.waitForSelector("text=Currently playing");
  check("dashboard currently-playing shows Hades", (await page.getByRole("img", { name: "Cover of Hades" }).count()) > 0);
  check("dashboard stat 'Now playing' present", await page.getByText("Now playing").isVisible());
  await page.screenshot({ path: `${shots}/08-currently-playing.png` });

  // 10c. Diary Playing filter shows it as "Playing since"
  await page.goto(`${BASE}/log`);
  await page.selectOption('select[name="status"]', "PLAYING");
  await page.click('button:has-text("Filter")');
  await page.waitForSelector("text=Playing since");
  const playingEntry = page.locator("li", { hasText: "Hades" }).first();
  check("diary Playing filter shows Hades", await playingEntry.isVisible());

  // 10d. Completing it: edit Hades → Beaten with a finish date, leaves currently-playing
  await playingEntry.getByRole("button", { name: "Edit" }).click();
  await page.waitForSelector("text=Edit log entry");
  await page.getByRole("button", { name: "✓ Beaten", exact: true }).click();
  await page.fill("#log-finished", "2026-07-02");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForSelector("text=Edit log entry", { state: "detached" });
  await page.goto(`${BASE}/`);
  await page.waitForSelector("text=Recently finished");
  const stillPlaying = await page.getByText("Currently playing").isVisible().catch(() => false);
  check("completed game left the currently-playing section", !stillPlaying);

  // 11. Delete a log from diary
  await page.goto(`${BASE}/log`);
  const smEntry = page.locator("li", { hasText: "Super Metroid" }).first();
  await smEntry.getByRole("button", { name: "Delete" }).click();
  await smEntry.getByRole("button", { name: "Yes" }).click();
  await page.waitForSelector("li:has-text('Super Metroid')", { state: "detached" });
  check("log deleted from diary", true);

  // 12. Nav links to the user's public profile
  check(
    "nav links to public profile",
    (await page.locator(`header a[href="/${username}"]`).count()) === 1
  );

  // 12b. Social links: pasted URLs are normalised; junk is rejected
  await page.goto(`${BASE}/settings`);
  await page.fill("#social-instagram", "https://www.instagram.com/Smoke.Tester/?hl=en");
  await page.fill("#social-bluesky", "not a handle!");
  await page.getByRole("button", { name: "Save links" }).click();
  await page.getByText("doesn't look like a Bluesky handle").waitFor();
  check("invalid Bluesky handle rejected", true);
  await page.fill("#social-bluesky", "@smoketester");
  await page.getByRole("button", { name: "Save links" }).click();
  await page.getByText("Saved.").first().waitFor();
  await page.reload();
  check("Instagram URL normalised to a handle", (await page.inputValue("#social-instagram")) === "smoke.tester");
  check("bare Bluesky name gets bsky.social", (await page.inputValue("#social-bluesky")) === "smoketester.bsky.social");

  // 12c. Profile picture from a finished game. Mock games have no art, so
  // give BotW a tiny inline cover first.
  {
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient();
    await db.game.updateMany({ where: { name: { contains: "Breath of the Wild" } }, data: { coverUrl: PIXEL } });
    await db.$disconnect();
  }
  await page.goto(`${BASE}/settings`);
  await page.getByRole("button", { name: /Breath of the Wild/ }).click();
  await page.getByRole("button", { name: "Save picture" }).click();
  await page.getByText("Saved.").first().waitFor();
  check("avatar saved", true);
  const navAvatar = page.locator(`header a[href="/${username}"] img[src^="data:image/png"]`);
  check("nav shows the game avatar", await navAvatar.waitFor({ timeout: 5000 }).then(() => true, () => false));
  await page.screenshot({ path: `${shots}/smoke-settings-profile.png`, fullPage: true });

  // 12d. Share page: builder previews a PNG; "last 4 played" swaps headings
  await page.getByRole("link", { name: "Share", exact: true }).click();
  await page.waitForURL("**/share");
  const preview = page.locator('img[alt="Preview of your share card"]');
  await page.waitForFunction(
    () => {
      const img = document.querySelector('img[alt="Preview of your share card"]');
      return img?.complete && img.naturalWidth > 0;
    },
    null,
    { timeout: 15000 }
  );
  check("share page shows a card preview", await preview.evaluate((img) => img.naturalWidth === 1080));
  await page.getByRole("button", { name: "Last 4 played" }).click();
  check("played cards offer played headings",
    await page.getByRole("button", { name: "What I've been playing" }).isVisible() &&
      !(await page.getByRole("button", { name: "Latest conquests" }).isVisible()));
  await page.waitForFunction(
    () => {
      const img = document.querySelector('img[alt="Preview of your share card"]');
      return img?.getAttribute("src")?.includes("games=played") && img.complete && img.naturalWidth > 0;
    },
    null,
    { timeout: 15000 }
  );
  check("preview follows the played option", true);
  await page.screenshot({ path: `${shots}/smoke-share.png`, fullPage: true });

  // 12e. RetroAchievements import (RA_MOCK sample library): link, review,
  // import. Confident matches are ticked; hacks/subsets/unknowns aren't.
  await page.goto(`${BASE}/settings`);
  await page.fill('input[aria-label="RetroAchievements username"]', "nobody");
  await page.getByRole("button", { name: "Link account" }).click();
  await page.getByText("No RetroAchievements user by that name").waitFor();
  check("RA link rejects an unknown user", true);
  await page.fill('input[aria-label="RetroAchievements username"]', "SmokeRA");
  await page.getByRole("button", { name: "Link account" }).click();
  await page.getByText(/10 new awards/).waitFor({ timeout: 20000 });
  check("RA link syncs awards", true);
  await page.getByRole("link", { name: /Review 9 to import/ }).click();
  await page.waitForURL("**/import/retroachievements");
  const raRow = (title) => page.locator("li", { has: page.getByRole("link", { name: title, exact: true }) });
  check("RA review: confident matches are ticked",
    await raRow("Super Metroid").getByRole("checkbox").isChecked() &&
      await raRow("Legend of Zelda, The: Ocarina of Time").getByRole("checkbox").isChecked());
  check("RA review: hacks and subsets aren't matched",
    await raRow("~Hack~ Super Metroid: Redesign").getByRole("checkbox").isDisabled() &&
      await raRow("Metroid Prime [Subset - Bonus]").getByRole("checkbox").isDisabled());
  check("RA review: beaten + mastered collapse to one row",
    (await page.getByRole("link", { name: "Super Metroid", exact: true }).count()) === 1);
  check("RA review: game already in the diary is linked, not duplicated",
    await raRow("Chrono Trigger").getByText(/will just link/).isVisible());
  await raRow("Final Fantasy VII").getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: "Import 5 games" }).click();
  await page.getByText("Imported 4, linked 1 already in your diary.").waitFor({ timeout: 15000 });
  check("RA import reports what it did", true);
  await raRow("Super Mario 64").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  check("RA review keeps unticked games for later",
    await raRow("Final Fantasy VII").isVisible() && !(await raRow("Super Mario 64").isVisible()));
  await page.screenshot({ path: `${shots}/smoke-ra-review.png`, fullPage: true });
  await page.goto(`${BASE}/log`);
  const smImported = page.locator("li", { hasText: "Super Metroid" }).first();
  check("RA import adds a mastered, dated diary entry",
    await smImported.getByText("★ Mastered").isVisible() && await smImported.getByText("Nov 2, 2025").isVisible());
  await smImported.getByRole("link", { name: /Super Metroid/ }).first().click();
  await page.waitForURL("**/games/**");
  check("game page links the RA set",
    await page.getByRole("link", { name: "Super Metroid on RetroAchievements" }).waitFor({ timeout: 10000 }).then(() => true, () => false));

  // 12e2. Steam import (STEAM_MOCK sample library): sign in through Steam
  // (mocked), sync, review suggested statuses, import.
  const forged = await page.request.get(`${BASE}/api/steam/callback?n=forged&mock=1`, { maxRedirects: 0 });
  check("Steam callback without this browser's nonce is refused",
    forged.status() === 307 && /steam=expired/.test(forged.headers()["location"] ?? ""));
  await page.goto(`${BASE}/settings#steam`);
  await page.getByRole("link", { name: "Sign in through Steam" }).click();
  await page.waitForURL("**/settings?steam=linked**");
  await page.getByText(/7 new games/).waitFor({ timeout: 20000 });
  check("Steam sign-in links the account and syncs", true);
  await page.getByRole("link", { name: /Review 6 to import/ }).click();
  await page.waitForURL("**/import/steam");
  const stRow = (name) => page.locator(`li[data-steam-row="${name}"]`);
  const stStatus = (name) => stRow(name).locator("select");
  check("Steam: 100% achievements suggests Mastered", (await stStatus("ELDEN RING").inputValue()) === "MASTERED");
  check("Steam: played recently suggests Playing", (await stStatus("Hades").inputValue()) === "PLAYING");
  check("Steam: not played lately suggests Shelved", (await stStatus("Hollow Knight").inputValue()) === "SHELVED");
  check("Steam: non-games aren't matched", await stRow("Wallpaper Engine").getByRole("checkbox").isDisabled());
  check("Steam: unplayed games aren't listed", (await stRow("The Witcher 3: Wild Hunt").count()) === 0);
  check("Steam: games played under an hour are hidden", (await stRow("Celeste").count()) === 0);
  await page.getByRole("button", { name: /Show 1 game played for under an hour/ }).click();
  check("Steam: hidden games can be shown, unticked", !(await stRow("Celeste").getByRole("checkbox").isChecked()));
  await stStatus("Portal 2").selectOption("BEATEN");
  check("Steam: choosing Beaten dates it by month", await stRow("Portal 2").getByText("finished Sep 2020").isVisible());
  await stRow("Stardew Valley").getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: "Import 4 games" }).click();
  await page.getByText(/^Imported \d/).waitFor({ timeout: 15000 });
  check("Steam import reports what it did", true);
  await stRow("ELDEN RING").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  check("Steam review keeps unticked games for later",
    await stRow("Stardew Valley").isVisible() && (await stRow("ELDEN RING").count()) === 0);
  await page.screenshot({ path: `${shots}/smoke-steam-review.png`, fullPage: true });
  await page.goto(`${BASE}/log`);
  const erImported = page.locator("li", { hasText: "Elden Ring" }).first();
  check("Steam import adds a mastered entry dated by the last achievement",
    await erImported.getByText("★ Mastered").isVisible() && await erImported.getByText("Aug 8, 2022").isVisible());
  check("Steam import adds a beaten entry with a month-only date",
    await page.locator("li", { hasText: "Portal 2" }).first().getByText("Sep 2020").isVisible());

  // 12f. Console chronicles (Extras): consoles with dates, ages, badges
  // and favourite games, drawn as a zig-zag map
  await page.goto(`${BASE}/extras`);
  await page.getByRole("link", { name: /Console chronicles/ }).click();
  await page.waitForURL("**/extras/chronicles");
  await page.goto(`${BASE}/chronicles`);
  check("signed-in visitors to /chronicles get their own editor", page.url().endsWith("/extras/chronicles"));
  await page.fill("#chronicle-birth", "1990");
  async function addConsole(platform, year, gameQuery) {
    if (!(await page.locator("#chronicle-console").count())) await page.getByRole("button", { name: "+ Add a console" }).click();
    await page.fill("#chronicle-console", platform);
    await page.getByRole("option", { name: platform, exact: true }).click();
    await page.locator('[aria-label="How exact"]').first().getByRole("button", { name: "Year" }).click();
    await page.selectOption("#chronicle-got", year);
    if (gameQuery) {
      await page.getByRole("button", { name: "Choose game 1" }).click();
      await page.fill('input[aria-label="Search for a game"]', gameQuery);
      await page.getByText("Searching…").waitFor({ state: "detached" }).catch(() => {});
      await page.locator('button[title^="Add "]').first().click();
    }
    await page.getByRole("button", { name: "Add to timeline" }).click();
    await page.waitForSelector("#chronicle-console", { state: "detached" });
  }
  // The console picker searches by other names too, popular ones first
  if (!(await page.locator("#chronicle-console").count())) await page.getByRole("button", { name: "+ Add a console" }).click();
  await page.fill("#chronicle-console", "ps2");
  check("console search finds PlayStation 2 by 'ps2'",
    (await page.getByRole("option").first().textContent()).trim() === "PlayStation 2");
  await page.fill("#chronicle-console", "genesis");
  check("console search finds the Mega Drive by 'genesis'",
    (await page.getByRole("option").first().textContent()).includes("Mega Drive"));
  await page.fill("#chronicle-console", "Nintendo Switch");
  await page.getByRole("option", { name: "Nintendo Switch", exact: true }).click();
  await page.getByRole("button", { name: "Choose game 1" }).click();
  check("tapping a game slot opens the search, focused",
    await page.locator('input[aria-label="Search for a game"]').evaluate((el) => el === document.activeElement));
  check("diary suggestions are games logged on that console",
    await page.getByText("From your diary").isVisible() && (await page.locator('button[title="Add The Legend of Zelda: Breath of the Wild"]').count()) === 1);
  await page.fill("#chronicle-console", "Game Boy Advance");
  await page.getByRole("option", { name: "Game Boy Advance", exact: true }).click();
  check("no diary suggestions from other consoles", (await page.getByText("From your diary").count()) === 0);
  await page.keyboard.press("Escape");
  await addConsole("PlayStation 2", "2002", null);
  await addConsole("Game Boy Advance", "2001", null);
  await addConsole("Nintendo Switch", "2017", "zelda");
  await addConsole("Xbox Series X", "2021", null);
  await addConsole("ZX Spectrum +2", "1988", null);
  await page.waitForTimeout(1000);
  const stops = page.locator("ol > li");
  check("chronicle orders consoles by when you got them",
    (await stops.nth(1).textContent()).includes("Game Boy Advance") && (await stops.nth(2).textContent()).includes("PlayStation 2"));
  check("chronicle works out ages from the birth year", await stops.nth(1).getByText("Age 11").isVisible());
  check("first home console and first handheld get badges",
    await stops.nth(2).getByText("First console").isVisible() && await stops.nth(1).getByText("First handheld").isVisible());
  check("console photos are shown", (await page.locator('ol img[src^="/consoles/"]').count()) >= 3);
  check("favourite games appear on the map", (await stops.nth(3).locator('[title*="Zelda"]').count()) === 1);
  check("Xbox Series X is its own console with its own photo",
    (await page.locator('ol img[src="/consoles/169-series-x.webp"]').count()) === 1 &&
      (await stops.nth(4).textContent()).includes("Xbox Series X"));
  check("computers are in the list, by model, with a first-computer badge",
    (await page.locator('ol img[src="/consoles/26-plus2.webp"]').count()) === 1 &&
      (await stops.nth(0).getByText("First computer").isVisible()));
  await page.getByRole("button", { name: "+ Add a console" }).click();
  check("adding a console opens a dialog with the button always in view",
    await page.getByRole("dialog").isVisible() &&
      await page.getByRole("button", { name: "Add to timeline" }).evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight));
  await page.keyboard.press("Escape");
  // The story video is made in the browser (WebCodecs H.264 into an MP4).
  await page.getByRole("button", { name: "Make story video" }).click();
  await page.waitForSelector("video", { timeout: 120000 });
  const video = await page.evaluate(async () => {
    const blob = await (await fetch(document.querySelector("video").src)).blob();
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    return { type: blob.type, size: blob.size, ftyp: String.fromCharCode(...head.slice(4, 8)) };
  });
  check("story video is an MP4 made on the device", video.type === "video/mp4" && video.ftyp === "ftyp" && video.size > 100000);
  check("editor page stays phone-width-safe", (await page.evaluate(() => document.documentElement.scrollWidth)) <= (await page.evaluate(() => innerWidth)));

  // 13. Sign out returns to login
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/login**");
  check("sign out redirects to login", true);

  // 14. Public profile is viewable signed out, without leaking the email
  await page.goto(`${BASE}/u/${username.toUpperCase()}`);
  check("old /u/ profile links redirect to /<username>",
    new URL(page.url()).pathname === `/${username.toUpperCase()}`);
  check("public profile loads signed out", !page.url().includes("/login"));
  check("public profile shows name", await page.getByRole("heading", { name: "Smoke Tester" }).isVisible());
  check("public profile shows a finished game", await page.getByText("Breath of the Wild").first().isVisible());
  check("public profile hides email", !(await page.content()).includes(email));
  check("public profile offers sign up", await page.getByRole("link", { name: "Join Beaten" }).isVisible());
  await page.screenshot({ path: `${shots}/profile-public.png`, fullPage: true });
  check("public profile links Instagram",
    (await page.locator('a[href="https://www.instagram.com/smoke.tester/"]').count()) === 1);
  check("public profile links Bluesky",
    (await page.locator('a[href="https://bsky.app/profile/smoketester.bsky.social"]').count()) === 1);
  check("public profile shows the game avatar", (await page.locator('main img[src^="data:image/png"]').count()) >= 1);
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  check("public profile has a share card og:image", Boolean(ogImage?.endsWith(`/${username}/card?format=wide`)));

  // 14a. Share cards render signed out at each size; options are whitelisted
  for (const [format, w, h] of [["square", 1080, 1080], ["story", 1080, 1920], ["wide", 1200, 630]]) {
    const res = await page.request.get(`${BASE}/${username}/card?format=${format}&accent=gold&bg=plain&stats=0`);
    const png = await res.body();
    check(`share card ${format} is a ${w}x${h} PNG`,
      res.headers()["content-type"] === "image/png" && png.readUInt32BE(16) === w && png.readUInt32BE(20) === h);
  }
  const playedCard = await page.request.get(`${BASE}/${username}/card?games=played&heading=playing`);
  check("played share card renders", playedCard.headers()["content-type"] === "image/png");
  const bogus = await page.request.get(`${BASE}/${username}/card?format=<script>&heading=pwned`);
  check("share card ignores unknown options", bogus.ok() && (await bogus.body()).readUInt32BE(16) === 1080);
  check("share card for unknown user is a 404",
    (await page.request.get(`${BASE}/no_such_user_xyz/card`)).status() === 404);

  const missing = await page.goto(`${BASE}/no_such_user_xyz`);
  check("unknown profile is a 404", missing?.status() === 404);

  // 14a2. Usernames: pages, swearing and reserved names are refused; an
  // admin invite unlocks a reserved name for one person
  const regContext = await browser.newContext();
  const reg = await regContext.newPage();
  async function tryRegister(handle, invite) {
    await reg.goto(`${BASE}/register${invite ? `?invite=${invite}` : ""}`);
    await reg.fill("#register-name", "Name Test");
    if (!invite) await reg.fill("#register-username", handle);
    await reg.fill("#register-email", `${handle}_${Date.now().toString(36)}@example.com`);
    await reg.fill("#register-password", `Name#${Date.now()}q`);
    await reg.click('button[type="submit"]');
    await reg.waitForSelector("text=/Check your email|isn't available|different username/");
    return (await reg.getByText("Check your email").count()) > 0;
  }
  check("username matching a page is refused", !(await tryRegister("settings")));
  check("swear word username is refused", !(await tryRegister("sh1t_lord")));
  check("built-in reserved username is refused", !(await tryRegister("nintendo")));
  check("innocent word containing a swear is allowed", await tryRegister(`scunthorpe_${Date.now().toString(36).slice(-4)}`));
  const reserved = `vip_${Date.now().toString(36)}`;
  const inviteLink = execFileSync("npx", ["tsx", "scripts/admin.ts", "reserve", reserved, "smoke test"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const inviteCode = new URL(inviteLink).searchParams.get("invite");
  check("admin-reserved username is refused without the invite", !(await tryRegister(reserved)));
  await reg.goto(`${BASE}/register?invite=${inviteCode}`);
  check("invite link pre-fills the reserved username",
    (await reg.inputValue("#register-username")) === reserved && (await reg.getByText("is saved for you").isVisible()));
  check("invite link lets that person sign up with it", await tryRegister(reserved, inviteCode));
  await regContext.close();

  // 14a3. The chronicle is public
  const chron = await page.goto(`${BASE}/${username}/chronicles`);
  check("console chronicle is public", chron?.status() === 200 && (await page.getByText("Game Boy Advance").first().isVisible()));

  // 14b. Support and privacy pages are public and linked from sign-in
  await page.goto(`${BASE}/login`);
  await page.getByRole("link", { name: "Get help" }).click();
  await page.waitForURL(/\/support$/);
  check("support page linked from sign in", await page.getByRole("heading", { name: "Help & support" }).isVisible());
  check("support page shows the free-site disclaimer",
    await page.getByText("there may be a delay").isVisible());
  check("support page shows the contact address",
    await page.getByRole("link", { name: "support@beaten.games" }).isVisible());
  await page.screenshot({ path: `${shots}/support.png`, fullPage: true });
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await page.waitForURL(/\/privacy$/);
  check("privacy page linked from footer", await page.getByRole("heading", { name: "Privacy", level: 1 }).isVisible());
  await page.screenshot({ path: `${shots}/privacy.png`, fullPage: true });

  // 15. "Sign out everywhere" revokes sessions on other devices too
  async function signInIn(ctxPage) {
    await ctxPage.goto(`${BASE}/login`);
    await ctxPage.fill("#login-email", email);
    await ctxPage.fill("#login-password", password);
    await ctxPage.getByRole("button", { name: "Sign in" }).click();
    await ctxPage.waitForSelector("text=Welcome back");
  }
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signInIn(page);
  await signInIn(other);
  await page.goto(`${BASE}/settings`);
  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await page.waitForURL("**/login**");
  await other.goto(`${BASE}/log`);
  await other.waitForURL("**/login**");
  check("sign out everywhere revokes other sessions", other.url().includes("/login"));
  await otherContext.close();

  // 16. Wrong password costs the same for unknown emails (no enumeration)
  async function timeLogin(loginEmail) {
    // The CSRF token is only accepted alongside its cookie; without it Auth.js
    // rejects the request before authorize() runs and nothing is measured.
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    const csrf = await csrfRes.json();
    const cookie = csrfRes.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const t0 = performance.now();
    const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
      body: new URLSearchParams({ email: loginEmail, password: "wrong-password", csrfToken: csrf.csrfToken }),
      redirect: "manual",
    });
    const elapsed = performance.now() - t0;
    if (!res.headers.get("location")?.includes("error=CredentialsSignin")) {
      throw new Error(`login probe was not a credentials rejection: ${res.headers.get("location")}`);
    }
    return elapsed;
  }
  const known = await timeLogin(email);
  const unknown = await timeLogin(`nobody-${Date.now()}@example.com`);
  check(`login timing similar for unknown email (${known.toFixed(0)}ms vs ${unknown.toFixed(0)}ms)`, known > 100 && unknown > known * 0.5);

  // 17. Change password: wrong current rejected; success signs out everywhere
  // and voids reset links sent before the change.
  const staleAskedAt = new Date().toISOString();
  {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/forgot-password`);
    await p.fill("#forgot-email", email);
    await p.getByRole("button", { name: "Send reset link" }).click();
    await p.waitForSelector("text=Check your email");
    await ctx.close();
  }
  const staleResetLink = linkIn(await waitForEmail(email, "Reset your Beaten password", staleAskedAt), "/reset-password");
  await signInIn(page);
  await page.goto(`${BASE}/settings`);
  const newPassword = `Changed#${Date.now()}y`;
  check("change password form names the account for password managers",
    (await page.locator('form:has(#current-password) input[autocomplete="username"]').inputValue()) === email);
  await page.fill("#current-password", "not-my-password");
  await page.fill("#change-new-password", newPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await page.waitForSelector("text=Current password is incorrect");
  check("change password rejects wrong current password", true);
  await page.fill("#current-password", password);
  await page.getByRole("button", { name: "Change password" }).click();
  await page.waitForURL("**/login?changed=1");
  check("password change signs out with notice", await page.getByText("Password changed").isVisible());
  password = newPassword;
  await signInIn(page);
  check("sign in works with the new password", true);
  await waitForEmail(email, "password was changed", registeredAt);
  check("password change sends a notification email", true);
  {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(staleResetLink);
    check("password change voids earlier reset links", await p.getByText("Link expired").isVisible());
    await ctx.close();
  }

  // 18. Forgot password: same answer for unknown emails; reset link works once
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login**");
  const unknownEmail = `nobody-${Date.now()}@example.com`;
  await page.goto(`${BASE}/forgot-password`);
  await page.fill("#forgot-email", unknownEmail);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.waitForSelector("text=Check your email");
  check("forgot password answers the same for unknown emails", true);
  const resetAskedAt = new Date().toISOString();
  await page.goto(`${BASE}/forgot-password`);
  await page.fill("#forgot-email", email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.waitForSelector("text=Check your email");
  const resetMail = await waitForEmail(email, "Reset your Beaten password", resetAskedAt);
  await new Promise((r) => setTimeout(r, 1000));
  check(
    "no email sent for an unknown address",
    !(await outbox()).some((m) => m.to === unknownEmail)
  );
  const resetLink = linkIn(resetMail, "/reset-password");
  await page.goto(resetLink);
  await page.waitForFunction(() => !location.search.includes("token="), null, { timeout: 5000 }).catch(() => {});
  check("reset token is removed from the address bar", !page.url().includes("token="));
  check(
    "reset page sets no-referrer",
    (await page.locator('meta[name="referrer"]').getAttribute("content")) === "no-referrer"
  );
  check("reset form names the account for password managers",
    (await page.locator('#reset-username[autocomplete="username"]').inputValue()) === email);
  const resetPasswordValue = `Reset%${Date.now()}w`;
  await page.fill("#reset-password", resetPasswordValue);
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.waitForURL("**/login?reset=1");
  password = resetPasswordValue;
  await signInIn(page);
  check("sign in works after password reset", true);
  await page.goto(resetLink);
  check("reset link can't be reused", await page.getByText("Link expired").isVisible());

  // 19. Data export (still signed in from step 18): JSON is complete and free
  // of secrets; CSV is the diary
  const jsonRes = await page.request.get(`${BASE}/api/account/export?format=json`);
  const exported = await jsonRes.json();
  check(
    "JSON export downloads as an attachment",
    jsonRes.headers()["content-disposition"]?.startsWith("attachment")
  );
  check("JSON export includes profile and logs", exported.profile.email === email && exported.logs.length >= 2);
  check("JSON export includes social links", exported.profile.instagram === "smoke.tester");
  check("JSON export includes the console chronicle",
    exported.consoleChronicle?.birthYear === 1990 && exported.consoleChronicle.consoles.length === 5);
  check(
    "JSON export includes reviews and shelves",
    exported.logs.some((l) => l.review?.includes("Masterpiece")) &&
      exported.shelves.some((s) => s.name === "All-timers")
  );
  const rawJson = JSON.stringify(exported);
  check("JSON export omits security fields", !/passwordHash|tokenVersion|tokenHash/.test(rawJson));
  const csvText = await (await page.request.get(`${BASE}/api/account/export?format=csv`)).text();
  check(
    "CSV export has header and a diary row",
    csvText.includes('"Game","Release year"') && csvText.includes("Breath of the Wild")
  );
  const anonContext = await browser.newContext();
  const anonRes = await anonContext.request.get(`${BASE}/api/account/export?format=json`);
  check("export requires sign-in", anonRes.status() === 401);
  await anonContext.close();

  // 19a. Following: a second player logs a game with a spoiler review; we
  // follow them, see it in our feed and on the game page, find them in
  // search; they see a new-follower badge; blocking undoes it all
  const friendName = `pal_${Date.now().toString(36)}`;
  const friendEmail = `${friendName}@example.com`;
  const friendPassword = `Pal#${Date.now()}x`;
  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  const friendSince = new Date().toISOString();

  // 18b. Console chronicles without an account: built in the browser,
  // brought into the account on sign-up
  await friend.goto(`${BASE}/chronicles`);
  await friend.getByText("Saved on this device only.").waitFor({ timeout: 15000 });
  check("guest chronicles editor works signed out", true);
  await friend.fill("#chronicle-name", "Pal");
  for (const [platform, year, gameQuery] of [["Nintendo Switch", "2018", "celeste"], ["Game Boy Advance", "2003", null]]) {
    await friend.getByRole("button", { name: "+ Add a console" }).click();
    await friend.fill("#chronicle-console", platform);
    await friend.getByRole("option", { name: platform, exact: true }).click();
    await friend.locator('[aria-label="How exact"]').first().getByRole("button", { name: "Year" }).click();
    await friend.selectOption("#chronicle-got", year);
    if (gameQuery) {
      await friend.getByRole("button", { name: "Choose game 1" }).click();
      await friend.fill('input[aria-label="Search for a game"]', gameQuery);
      await friend.locator('button[title^="Add "]').first().click({ timeout: 10000 });
    }
    await friend.getByRole("button", { name: "Add to timeline" }).click();
    await friend.waitForSelector("#chronicle-console", { state: "detached" });
  }
  check("guests can search for games", (await friend.locator('img[alt="Celeste"], [title="Celeste"]').count()) > 0);
  await friend.waitForTimeout(900);
  await friend.reload();
  await friend.getByText("Saved on this device only.").waitFor();
  const guestStops = await friend.locator("ol > li").allTextContents();
  check("guest chronicle survives a reload, in date order",
    guestStops.length === 2 && guestStops[0].includes("Game Boy Advance") && guestStops[1].includes("Nintendo Switch"));
  check("guest chronicle uses the name typed", await friend.getByText(/^Pal · 2 consoles/).isVisible());
  check("guests can make the story video", await friend.getByRole("button", { name: "Make story video" }).isVisible());
  const limitedIp = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
  let lastStatus = 0;
  for (let i = 0; i < 151; i++) {
    lastStatus = (await friendContext.request.get(`${BASE}/api/igdb/search?q=zelda`, { headers: { "X-Forwarded-For": limitedIp } })).status();
  }
  check("guest game search is limited per IP address", lastStatus === 429);

  await friend.goto(`${BASE}/register`);
  await friend.fill("#register-name", "Pal Tester");
  await friend.fill("#register-username", friendName);
  await friend.fill("#register-email", friendEmail);
  await friend.fill("#register-password", friendPassword);
  await friend.click('button[type="submit"]');
  await friend.waitForSelector("text=Check your email");
  await friend.goto(linkIn(await waitForEmail(friendEmail, "Confirm your email", friendSince), "/verify-email"));
  await friend.getByRole("button", { name: "Confirm my email" }).click();
  await friend.waitForURL("**/login?verified=1");
  await friend.fill("#login-email", friendEmail);
  await friend.fill("#login-password", friendPassword);
  await friend.getByRole("button", { name: "Sign in" }).click();
  await friend.waitForSelector("text=Welcome back");
  await friend.getByRole("link", { name: "Add it to your account →" }).click();
  await friend.getByText(/now in your account \(2 consoles\)/).waitFor({ timeout: 15000 });
  await friend.locator("ol > li", { hasText: "Nintendo Switch" }).first().waitFor();
  check("signing up brings the guest chronicle into the account",
    (await friend.locator("ol > li").count()) === 2 && (await friend.locator('[title="Celeste"], img[alt="Celeste"]').count()) > 0);
  await friend.goto(`${BASE}/`);
  await friend.waitForSelector("text=Welcome back");
  check("the browser copy is cleared once imported", (await friend.getByText("before signing in").count()) === 0);
  await friend.goto(`${BASE}/games/900011`);
  await friend.getByRole("button", { name: "✓ I've beaten this" }).click();
  await friend.waitForSelector("text=Add to your played log");
  await friend.getByRole("radio", { name: "4 stars" }).click();
  await friend.fill("#log-review", "The summit twist got me.");
  await friend.check("#log-spoilers");
  await friend.getByRole("button", { name: "Save log" }).click();
  await friend.waitForSelector("text=Add to your played log", { state: "detached" });

  await page.goto(`${BASE}/people?q=${friendName.slice(0, 6)}`);
  check("people search finds another player", (await page.getByRole("link", { name: new RegExp(friendName) }).count()) === 1);
  await page.goto(`${BASE}/${friendName}`);
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  // (Moved away: hovering the button shows "Unfollow".)
  await page.mouse.move(0, 0);
  await page.getByRole("button", { name: "Following" }).waitFor();
  check("following someone updates their follower count", await page.getByText(/^1 followers$/).isVisible().catch(() => false) ||
    (await page.locator("a", { hasText: "followers" }).first().textContent()).includes("1"));
  await page.goto(`${BASE}/`);
  const fromFriends = page.locator("#following-feed");
  check("dashboard feed shows what people you follow did",
    await fromFriends.getByText("beat").first().isVisible() && await fromFriends.getByRole("link", { name: "Celeste" }).first().isVisible());
  check("spoiler reviews are blurred in the feed", await fromFriends.getByText("Contains spoilers · show").isVisible());
  await fromFriends.getByText("Contains spoilers · show").click();
  check("tapping shows the spoiler review", await fromFriends.getByText("The summit twist got me.").isVisible());
  await page.goto(`${BASE}/games/900011`);
  check("game page shows friends who've played it", await page.getByRole("heading", { name: "Friends who've played this" }).isVisible() &&
    await page.getByRole("link", { name: "Pal Tester" }).isVisible());
  const exportedFollows = await (await page.request.get(`${BASE}/api/account/export?format=json`)).json();
  check("export lists who you follow", exportedFollows.following.some((f) => f.username === friendName));

  await friend.goto(`${BASE}/`);
  check("new followers show as a badge on your avatar", (await friend.locator(`header a[href="/${friendName}/followers"]`).count()) === 1);
  await friend.goto(`${BASE}/${friendName}/followers`);
  check("followers list shows who follows you", await friend.getByRole("link", { name: new RegExp(username) }).isVisible());
  await friend.goto(`${BASE}/`);
  check("seeing your followers clears the badge", (await friend.locator(`header a[href="/${friendName}/followers"]`).count()) === 0);
  check("followers lists need sign-in",
    (await (await browser.newContext()).request.get(`${BASE}/${friendName}/followers`, { maxRedirects: 0 })).status() === 307);

  await page.goto(`${BASE}/${friendName}`);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: `Block @${friendName}` }).click();
  await page.getByRole("button", { name: "Block", exact: true }).click();
  await page.getByRole("button", { name: "Unblock" }).waitFor();
  check("blocking ends the follow", (await page.getByRole("button", { name: "Following" }).count()) === 0);
  await page.goto(`${BASE}/`);
  check("blocked people drop out of your feed",
    (await page.locator("#following-feed").getByRole("link", { name: "Celeste" }).count()) === 0);
  await friend.goto(`${BASE}/${username}`);
  await friend.getByRole("button", { name: "Follow", exact: true }).click();
  check("someone you've blocked can't follow you",
    await friend.getByText("You can't follow this account").waitFor({ timeout: 8000 }).then(() => true, () => false));
  await page.goto(`${BASE}/settings`);
  check("settings lists blocked accounts", await page.locator("#blocked").getByText(`@${friendName}`).first().isVisible());
  await page.locator("#blocked").getByRole("button", { name: "Unblock" }).click();
  await page.locator("#blocked").getByText("You haven't blocked anyone.").waitFor();
  check("unblocking from settings", true);
  await friendContext.close();

  // 19b. Username changes: the first is free, then once per 60 days; the
  // old name is held so nobody else can take it
  const renamed = `${username}_r`;
  await page.goto(`${BASE}/settings`);
  await page.fill("#settings-username", renamed);
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await page.waitForSelector("text=Saved.");
  check("first username change is allowed", (await page.request.get(`${BASE}/${renamed}`)).status() === 200);
  check("old profile URL is gone after a rename", (await page.request.get(`${BASE}/${username}`)).status() === 404);
  await page.reload();
  check("settings says when the username can change again", await page.getByText("You can change it again on").isVisible());
  await page.fill("#settings-username", `${username}_s`);
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await page.waitForSelector("text=once every 60 days");
  check("second username change within 60 days is refused", true);
  const heldContext = await browser.newContext();
  const held = await heldContext.newPage();
  await held.goto(`${BASE}/register`);
  await held.fill("#register-name", "Squatter");
  await held.fill("#register-username", username);
  await held.fill("#register-email", `squat_${Date.now().toString(36)}@example.com`);
  await held.fill("#register-password", `Squat#${Date.now()}q`);
  await held.click('button[type="submit"]');
  await held.waitForSelector("text=/isn't available|Check your email/");
  check("a previous username is held from other people", (await held.getByText("isn't available").count()) === 1);
  await heldContext.close();

  // 20. Delete account: needs the password; removes profile and sign-in
  const deleteAskedAt = new Date().toISOString();
  await page.goto(`${BASE}/settings`);
  await page.getByRole("button", { name: "Delete my account…" }).click();
  await page.fill("#delete-confirmation", "wrong-password");
  await page.getByRole("button", { name: "Permanently delete account" }).click();
  await page.waitForSelector("text=Password is incorrect");
  check("account deletion requires the correct password", true);
  await page.fill("#delete-confirmation", password);
  await page.getByRole("button", { name: "Permanently delete account" }).click();
  await page.waitForURL("**/login?deleted=1");
  check("deleting the account signs out with notice", await page.getByText("account has been deleted").isVisible());
  const goneProfile = await page.goto(`${BASE}/${renamed}`);
  check("deleted user's public profile is gone", goneProfile?.status() === 404);
  await page.goto(`${BASE}/login`);
  await page.fill("#login-email", email);
  await page.fill("#login-password", password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForSelector("text=Incorrect email or password");
  check("deleted account can't sign in", true);
  await waitForEmail(email, "account has been deleted", deleteAskedAt);
  check("deletion confirmation email sent", true);
} catch (e) {
  failures++;
  console.error("FAIL (exception):", e.message);
  await page.screenshot({ path: `${shots}/99-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
