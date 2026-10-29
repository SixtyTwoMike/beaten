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
  data: { email, passwordHash: await bcrypt.hash(password, 12), emailVerifiedAt: new Date() },
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

  // --- export, devices
  const exported = await api("GET", "/account/export");
  check("export", exported.status === 200 && exported.json.format === "beaten-export", exported.status);
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
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll API checks passed");
process.exit(failures ? 1 : 0);
