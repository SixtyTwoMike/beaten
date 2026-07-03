// End-to-end smoke test against the dev server (IGDB_MOCK=1).
import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
const email = `smoke-${Date.now()}@example.com`;
const password = "hunter2hunter2";
const shots = process.env.SMOKE_SHOTS_DIR || "/tmp";

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
  // 1. Unauthenticated access redirects to /login
  await page.goto(`${BASE}/`);
  await page.waitForURL("**/login");
  check("unauthenticated / redirects to /login", page.url().includes("/login"));

  // 2. Register
  await page.goto(`${BASE}/register`);
  await page.fill('input[placeholder="Display name"]', "Smoke Tester");
  await page.fill('input[placeholder="Email"]', email);
  await page.fill('input[placeholder="Password (8+ characters)"]', password);
  await page.click('button[type="submit"]');
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
  await smCard.getByRole("button", { name: "Mastered", exact: true }).click();
  await page.waitForSelector("text=Add to your played log");
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

  // 10. Game detail page
  await page.goto(`${BASE}/search`);
  await page.fill('input[type="search"]', "hades");
  await page.waitForSelector("text=Hades");
  await page.click('a:has-text("Hades")');
  await page.waitForSelector("text=I've beaten this");
  check("game detail shows log buttons", true);
  check("game detail shows external links stub", await page.getByText("RetroAchievements").isVisible());
  await page.screenshot({ path: `${shots}/07-game-detail.png` });

  // 11. Delete a log from diary
  await page.goto(`${BASE}/log`);
  const smEntry = page.locator("li", { hasText: "Super Metroid" }).first();
  await smEntry.getByRole("button", { name: "Delete" }).click();
  await smEntry.getByRole("button", { name: "Yes" }).click();
  await page.waitForSelector("li:has-text('Super Metroid')", { state: "detached" });
  check("log deleted from diary", true);

  // 12. Sign out returns to login
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login**");
  check("sign out redirects to login", true);
} catch (e) {
  failures++;
  console.error("FAIL (exception):", e.message);
  await page.screenshot({ path: `${shots}/99-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
