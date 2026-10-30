// Smoke test for the iPhone app's JSON API (/api/v1) against the dev server.
// Makes a throwaway verified account straight in the dev database, drives
// every endpoint with a bearer token, then deletes the account through the
// API. Works with IGDB_MOCK=1 or real IGDB.
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.SMOKE_BASE || "http://localhost:3000";
const email = `api-smoke-${Date.now()}@example.com`;
const password = `ApiSmoke!${Date.now()}x`;
const username = `apismoke_${Date.now().toString(36)}`;
const pal = { email: `api-pal-${Date.now()}@example.com`, password: `ApiPal!${Date.now()}x`, username: `apipal_${Date.now().toString(36)}` };

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

let token = null;
async function api(method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      ...(token && { authorization: `Bearer ${token}` }),
      ...(body !== undefined && { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json };
}

const prisma = new PrismaClient();
await prisma.user.create({
  data: { email, username, passwordHash: await bcrypt.hash(password, 12), emailVerifiedAt: new Date() },
});
await prisma.user.create({
  data: { email: pal.email, username: pal.username, name: "API Pal", passwordHash: await bcrypt.hash(pal.password, 12), emailVerifiedAt: new Date() },
});

try {
  // --- auth
  check("no token → 401", (await api("GET", "/me")).status === 401);
  token = "nonsense";
  check("bad token → 401", (await api("GET", "/me")).status === 401);
  token = null;
  check("wrong password → 401", (await api("POST", "/auth/login", { email, password: "nope" })).status === 401);
  const login = await api("POST", "/auth/login", { email, password, deviceName: "Smoke iPhone" });
  check("login → token + me", login.status === 200 && login.json.token && login.json.me.email === email, login);
  token = login.json.token;
  check("me", (await api("GET", "/me")).json?.hasPassword === true);
  check("not JSON → 400", (await fetch(`${BASE}/api/v1/logs`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: "x" })).status === 400);

  // --- search + game
  const search = await api("GET", "/games/search?q=zelda");
  const game = search.json?.results?.[0];
  check("search finds games", search.status === 200 && game?.igdbId > 0, search);
  check("platforms", (await api("GET", "/platforms")).json?.platforms?.length > 0);
  const detail = await api("GET", `/games/${game.igdbId}`);
  check("game detail", detail.status === 200 && detail.json.game.name === game.name && detail.json.logs.length === 0, detail);
  check("unknown game → 404", (await api("GET", "/games/0")).status === 404);

  // --- logs
  const clientId = randomBytes(12).toString("base64url");
  const entry = {
    id: clientId,
    igdbId: game.igdbId,
    status: "BEATEN",
    platformId: game.platformIds[0] ?? null,
    startedAt: "2026-03",
    finishedAt: "2026-04-02",
    isReplay: false,
    rating: 8,
    reviewText: "Loved it",
    newShelfName: "Smoke shelf",
  };
  const created = await api("POST", "/logs", entry);
  check("create log", created.status === 201 && created.json.log.id === clientId, created);
  check("partial dates round-trip", created.json?.log.startedAt === "2026-03" && created.json?.log.finishedAt === "2026-04-02");
  const retried = await api("POST", "/logs", entry);
  check("retried create returns the same log", retried.status === 201 && retried.json.log.id === clientId);
  const diary = await api("GET", "/logs");
  check("diary has exactly one log", diary.json?.logs?.length === 1 && diary.json.logs[0].game.igdbId === game.igdbId, diary);
  check("validation errors are 400", (await api("POST", "/logs", { ...entry, id: undefined, finishedAt: null })).status === 400);
  const edited = await api("PATCH", `/logs/${clientId}`, { ...entry, status: "MASTERED", rating: 10 });
  check("edit log", edited.status === 200 && edited.json.log.status === "MASTERED" && edited.json.log.rating === 10, edited);
  check("edit unknown log → 404", (await api("PATCH", "/logs/nope", entry)).status === 404);
  check("me stats count it", (await api("GET", "/me")).json?.stats.mastered === 1);

  // --- shelves
  let shelves = await api("GET", "/shelves");
  const smokeShelf = shelves.json?.shelves?.find((s) => s.name === "Smoke shelf");
  check("log created its new shelf with the game on it", smokeShelf?.games[0]?.igdbId === game.igdbId, shelves);
  const made = await api("POST", "/shelves", { name: "Second shelf" });
  check("create shelf", made.status === 201 && made.json.shelf.id, made);
  check("duplicate shelf name → 400", (await api("POST", "/shelves", { name: "Second shelf" })).status === 400);
  const shelfId = made.json.shelf.id;
  check("add game to shelf", (await api("POST", `/shelves/${shelfId}/games/${game.igdbId}`)).status === 200);
  check("game detail lists both shelves", (await api("GET", `/games/${game.igdbId}`)).json?.shelfIds.length === 2);
  check("remove game from shelf", (await api("DELETE", `/shelves/${shelfId}/games/${game.igdbId}`)).status === 200);
  shelves = await api("GET", "/shelves");
  check("shelf is empty again", shelves.json.shelves.find((s) => s.id === shelfId)?.games.length === 0);
  check("delete shelf", (await api("DELETE", `/shelves/${shelfId}`)).status === 200);
  check("delete shelf again → 404", (await api("DELETE", `/shelves/${shelfId}`)).status === 404);

  // --- console chronicles
  const consoles = await api("GET", "/chronicle/consoles");
  const ps1 = consoles.json?.consoles?.find((c) => c.platformId === 7);
  check("console picker lists consoles, photos absolute", consoles.status === 200 && ps1?.art?.src?.startsWith("http"), consoles.status);
  const empty = await api("GET", "/chronicle");
  check("empty chronicle", empty.status === 200 && empty.json.chronicle.stops.length === 0, empty);
  if (entry.platformId) check("suggestions from the diary", empty.json?.suggestions?.[entry.platformId]?.[0]?.igdbId === game.igdbId, empty.json?.suggestions);
  check("bad birth year → 400", (await api("PATCH", "/chronicle", { birthYear: 12 })).status === 400);
  const styled = await api("PATCH", "/chronicle", { title: "Smoke years", birthYear: 1990, showAges: true, accent: "gold", background: "grid", path: "pixel" });
  check("chronicle settings", styled.status === 200 && styled.json.chronicle.path === "pixel" && styled.json.chronicle.title === "Smoke years", styled);
  const added = await api("POST", "/chronicle/entries", { platformId: 7, gotAt: "1998-12", note: "Christmas", games: [game.igdbId] });
  const stop = added.json?.chronicle?.stops?.[0];
  check("add console", added.status === 201 && stop?.id === added.json.id && stop.age === 8 && stop.badges.includes("FIRST_CONSOLE"), added);
  check("console's game", stop?.games?.[0]?.igdbId === game.igdbId);
  check("unknown console → 400", (await api("POST", "/chronicle/entries", { platformId: 999999, gotAt: "2000" })).status === 400);
  const moved = await api("PATCH", `/chronicle/entries/${added.json?.id}`, { platformId: 7, gotAt: "1999", games: [] });
  check("edit console", moved.status === 200 && moved.json.chronicle.stops[0].gotLabel === "1999" && moved.json.chronicle.stops[0].games.length === 0, moved);
  check("edit unknown console → 404", (await api("PATCH", "/chronicle/entries/nope", { platformId: 7, gotAt: "1999" })).status === 404);
  check("delete console", (await api("DELETE", `/chronicle/entries/${added.json?.id}`)).json?.chronicle?.stops?.length === 0);
  check("delete it again → 404", (await api("DELETE", `/chronicle/entries/${added.json?.id}`)).status === 404);

  // --- year in review (the smoke log was finished 2026-04-02, mastered, rated 10)
  const review = await api("GET", "/year-review?year=2026");
  check("year in review", review.status === 200 && review.json.review.finished === 1 && review.json.review.mastered === 1 && review.json.review.top[0]?.igdbId === game.igdbId, review.json);
  check("year in review lists its years", review.json?.review?.years?.includes(2026));
  check("first game and busiest month", review.json?.review?.firstGame?.igdbId === game.igdbId && review.json.review.bestMonth?.month === 4 && review.json.review.bestMonth.count === 1, review.json?.review);
  check("future year → 400", (await api("GET", "/year-review?year=2999")).status === 400);

  // --- following, feed, reactions, comments (with a second account)
  const me0 = (await api("GET", "/me")).json;
  check("me has follower counts", me0?.social?.followers === 0 && me0.social.following === 0, me0?.social);
  const myToken = token;
  token = (await api("POST", "/auth/login", { email: pal.email, password: pal.password })).json.token;
  const palToken = token;
  const palLog = await api("POST", "/logs", { igdbId: game.igdbId, status: "BEATEN", finishedAt: "2026-05", rating: 7, reviewText: "Pal's review", containsSpoilers: true });
  check("second account reviews a game", palLog.status === 201, palLog);
  const palLogId = palLog.json?.log.id;
  token = myToken;
  check("short people search → empty", (await api("GET", "/people?q=a")).json?.people?.length === 0);
  const found = await api("GET", `/people?q=${pal.username.slice(0, 7)}`);
  check("people search", found.json?.people?.some((p) => p.username === pal.username && p.name === "API Pal"), found);
  const prof0 = await api("GET", `/users/${pal.username}`);
  check("profile", prof0.status === 200 && prof0.json.profile.relation.canFollow && !prof0.json.profile.relation.following && prof0.json.profile.reviews[0]?.reviewText === "Pal's review", prof0);
  check("unknown profile → 404", (await api("GET", "/users/nobody_here_xyz")).status === 404);
  check("empty feed before following", (await api("GET", "/feed")).json?.followsAnyone === false);
  const followed = await api("POST", `/users/${pal.username}/follow`);
  check("follow", followed.status === 200 && followed.json.profile.relation.following && followed.json.profile.counts.followers === 1, followed);
  check("can't follow yourself", (await api("POST", `/users/${username}/follow`)).status === 403);
  check("following list", (await api("GET", `/users/${username}/following`)).json?.people?.[0]?.username === pal.username);
  const feed = await api("GET", "/feed");
  const card = feed.json?.cards?.find((c) => c.logId === palLogId);
  check("feed shows their review with social", card?.reviewed && card.verb.endsWith("reviewed") && card.log.containsSpoilers && card.log.finishedAt === "2026-05" && card.social?.commentCount === 0 && card.social.reactions.length === 5, feed.json);
  check("my own feed", (await api("GET", "/feed?scope=you")).json?.cards?.some((c) => c.game?.igdbId === game.igdbId));
  const heart = await api("POST", `/reviews/${palLogId}/reactions`, { kind: "heart" });
  check("react", heart.json?.social?.reactions.find((r) => r.kind === "heart")?.count === 1 && heart.json.social.reactions.find((r) => r.kind === "heart").mine, heart);
  const unheart = await api("POST", `/reviews/${palLogId}/reactions`, { kind: "heart" });
  check("react again takes it away", unheart.json?.social?.reactions.find((r) => r.kind === "heart")?.count === 0);
  await api("POST", `/reviews/${palLogId}/reactions`, { kind: "gg" });
  check("unknown reaction → 400", (await api("POST", `/reviews/${palLogId}/reactions`, { kind: "poop" })).status === 400);
  check("react to an unknown review → 404", (await api("POST", `/reviews/nope/reactions`, { kind: "heart" })).status === 404);
  check("empty comment → 400", (await api("POST", `/reviews/${palLogId}/comments`, { body: "  " })).status === 400);
  check("long comment → 400", (await api("POST", `/reviews/${palLogId}/comments`, { body: "x".repeat(1001) })).status === 400);
  const commented = await api("POST", `/reviews/${palLogId}/comments`, { body: "Great call on the ending" });
  check("comment", commented.status === 201 && commented.json.comments.length === 1 && commented.json.comments[0].author.username === username && commented.json.comments[0].canDelete, commented);
  const commentId = commented.json?.comments?.[0]?.id;
  check("feed counts the comment", (await api("GET", "/feed")).json?.cards?.find((c) => c.logId === palLogId)?.social?.commentCount === 1);
  token = palToken;
  const palMe = (await api("GET", "/me")).json;
  check("they see a new follower", palMe?.social?.followers === 1 && palMe.social.newFollowers === 1, palMe?.social);
  check("followers list", (await api("GET", `/users/${pal.username}/followers`)).json?.people?.[0]?.username === username);
  check("seeing followers clears the count", (await api("GET", "/me")).json?.social?.newFollowers === 0);
  const theirs = await api("GET", `/reviews/${palLogId}/comments`);
  check("review author can delete comments on it", theirs.json?.comments?.[0]?.canDelete === true, theirs);
  check("blocking", (await api("POST", `/users/${username}/block`)).json?.profile?.relation?.blocked === true);
  token = myToken;
  check("blocked: follow ends", (await api("GET", `/users/${pal.username}`)).json?.profile?.relation?.following === false);
  check("blocked: can't follow back", (await api("POST", `/users/${pal.username}/follow`)).status === 403);
  check("blocked: can't see comments", (await api("GET", `/reviews/${palLogId}/comments`)).status === 404);
  check("blocked: can't react", (await api("POST", `/reviews/${palLogId}/reactions`, { kind: "fire" })).status === 404);
  token = palToken;
  check("blocked people's comments are left out of counts",
    (await api("GET", "/feed?scope=you")).json?.cards?.find((c) => c.logId === palLogId)?.social?.commentCount === 0);
  await api("DELETE", `/users/${username}/block`);
  const reply = await api("POST", `/reviews/${palLogId}/comments`, { body: "Thanks!" });
  check("review author can reply", reply.status === 201 && reply.json.comments.length === 2, reply);
  const replyId = reply.json?.comments?.find((c) => c.body === "Thanks!")?.id;
  token = myToken;
  check("can't delete someone else's comment", (await api("DELETE", `/comments/${replyId}`)).status === 404);
  token = palToken;
  check("review author deletes a comment", (await api("DELETE", `/comments/${commentId}`)).status === 200);
  check("deleted comment → 404", (await api("DELETE", `/comments/${commentId}`)).status === 404);
  token = myToken;
  check("comment is gone", (await api("GET", `/reviews/${palLogId}/comments`)).json?.comments?.map((c) => c.body).join() === "Thanks!");
  await api("POST", `/users/${pal.username}/follow`);
  check("unfollow", (await api("DELETE", `/users/${pal.username}/follow`)).json?.profile?.relation?.following === false);

  // --- export, devices
  const exported = await api("GET", "/account/export");
  check("export", exported.status === 200 && exported.json.format === "beaten-export", exported.status);
  check("export lists reactions", exported.json?.reactions?.some((r) => r.reaction === "gg" && r.onReviewBy === pal.username), exported.json?.reactions);
  const second = (await api("POST", "/auth/login", { email, password, deviceName: "Smoke iPad" })).json.token;
  const devices = await api("GET", "/devices");
  check("two devices, this one marked", devices.json?.devices.length === 2 && devices.json.devices.filter((d) => d.current).length === 1, devices);
  const ipad = devices.json.devices.find((d) => d.name === "Smoke iPad");
  check("sign out another device", (await api("DELETE", `/devices/${ipad.id}`)).status === 200);
  const mine = token;
  token = second;
  check("its token stops working", (await api("GET", "/me")).status === 401);
  token = mine;

  // --- delete log, sign out everywhere voids tokens
  check("delete log", (await api("DELETE", `/logs/${clientId}`)).status === 200);
  check("diary is empty", (await api("GET", "/logs")).json?.logs.length === 0);
  await prisma.user.update({ where: { email }, data: { tokenVersion: { increment: 1 } } });
  check("sign out everywhere voids the token", (await api("GET", "/me")).status === 401);
  token = (await api("POST", "/auth/login", { email, password })).json.token;

  // --- logout, account deletion
  const third = (await api("POST", "/auth/login", { email, password })).json.token;
  const keep = token;
  token = third;
  check("logout", (await api("POST", "/auth/logout")).status === 200);
  check("logged-out token → 401", (await api("GET", "/me")).status === 401);
  token = keep;
  check("delete account needs the password", (await api("DELETE", "/account", { confirmation: "wrong" })).status === 403);
  check("delete account", (await api("DELETE", "/account", { confirmation: password })).status === 200);
  check("account is gone", (await prisma.user.findUnique({ where: { email } })) === null);
} finally {
  await prisma.user.deleteMany({ where: { email: { in: [email, pal.email] } } });
  await prisma.$disconnect();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll API checks passed");
process.exit(failures ? 1 : 0);
