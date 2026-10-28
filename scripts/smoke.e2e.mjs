// End-to-end smoke test against the dev server (IGDB_MOCK=1).
// Emails are read from the dev outbox the app writes in development.
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
const email = `smoke-${Date.now()}@example.com`;
// Unique per run so it can't appear in the breached-password corpus.
let password = `Smoke!${Date.now()}x`;
const username = `smoke_${Date.now().toString(36)}`;
const shots = process.env.SMOKE_SHOTS_DIR || "/tmp";

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
  check("register lands on dashboard", await page.getByText("Welcome back, Smoke Tester").isVisible());
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
    (await page.locator(`header a[href="/u/${username}"]`).count()) === 1
  );

  // 13. Sign out returns to login
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login**");
  check("sign out redirects to login", true);

  // 14. Public profile is viewable signed out, without leaking the email
  await page.goto(`${BASE}/u/${username.toUpperCase()}`);
  check("public profile loads signed out", page.url().includes(`/u/`) && !page.url().includes("/login"));
  check("public profile shows name", await page.getByRole("heading", { name: "Smoke Tester" }).isVisible());
  check("public profile shows a finished game", await page.getByText("Breath of the Wild").first().isVisible());
  check("public profile hides email", !(await page.content()).includes(email));
  check("public profile offers sign up", await page.getByRole("link", { name: "Join Beaten" }).isVisible());
  await page.screenshot({ path: `${shots}/profile-public.png`, fullPage: true });
  const missing = await page.goto(`${BASE}/u/no_such_user_xyz`);
  check("unknown profile is a 404", missing?.status() === 404);

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
  await signInIn(page);
  await page.goto(`${BASE}/settings`);
  const newPassword = `Changed#${Date.now()}y`;
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
  check(
    "reset page sets no-referrer",
    (await page.locator('meta[name="referrer"]').getAttribute("content")) === "no-referrer"
  );
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
  const goneProfile = await page.goto(`${BASE}/u/${username}`);
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
