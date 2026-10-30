// Support commands for account queries. Runs on the server as
// `sudo beaten-admin <command> ...` (installed by install-from-bundle.sh);
// from your Mac use ./deploy/admin.sh. See docs/support-playbook.md.
//
// Compiled to CommonJS by tsconfig.admin.json so it can reuse the app's own
// token, email and export code without a bundler. Messages go to stderr;
// stdout carries only command output (export JSON), so it can be redirected.

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { markEmailVerified } from "../src/lib/accounts";
import { issueToken, revokeTokens } from "../src/lib/tokens";
import { buildExport } from "../src/lib/export";
import { MAX_EMAIL } from "../src/lib/limits";
import { normalizeUsername, usernameError } from "../src/lib/username";
import { isBuiltInReserved } from "../src/lib/username-rules";
import { reserveUsername } from "../src/lib/reserved-usernames";
import {
  sendAccountDeletedEmail,
  sendEmailChangedEmail,
  sendPasswordResetEmail,
  sendVerifyEmail,
} from "../src/lib/account-emails";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USAGE = `Usage: beaten-admin <command> <email | username>

  create <email> [username]      make a confirmed password account; prints
                                 its generated password once
  find <who>                     account summary (no secrets)
  send-reset <who>               email a password reset link
  send-verify <who>              email a new confirmation link
  verify <who>                   mark the email confirmed without a link
  revoke-sessions <who>          sign the account out everywhere
  change-email <who> <new>       move to a new address (re-confirm required)
  export <who>                   print the account's data export (JSON)
  delete <who> --yes             permanently delete the account
  rename <who> <username>        change the username (no wait; old name not held)

  reserve <username> [note]      set a username aside; prints an invite link
                                 for the one person who should get it
  unreserve <username>           release a reserved username
  reservations                   list reserved and held usernames
  check-usernames                list accounts whose username breaks the rules

Only act on requests sent from the account's own email address.`;

const log = (msg: string) => console.error(msg);

class Fail extends Error {}

async function findUser(who: string | undefined) {
  if (!who) throw new Fail(USAGE);
  const value = who.trim();
  const user = value.includes("@") && !value.startsWith("@")
    ? await prisma.user.findUnique({ where: { email: value.toLowerCase() } })
    : await prisma.user.findUnique({ where: { username: normalizeUsername(value) } });
  if (!user) throw new Fail(`No account matches "${value}".`);
  return user;
}

type User = Awaited<ReturnType<typeof findUser>>;

function label(user: User) {
  return `${user.email}${user.username ? ` (@${user.username})` : ""}`;
}

async function find(user: User) {
  const [logs, shelves, recentTokens] = await Promise.all([
    prisma.playLog.count({ where: { userId: user.id } }),
    prisma.shelf.count({ where: { userId: user.id } }),
    prisma.authToken.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      select: { purpose: true, createdAt: true, usedAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const rows: [string, string][] = [
    ["Email", user.email],
    ["Username", user.username ? `@${user.username}` : "(not set)"],
    ["Name", user.name ?? "(not set)"],
    ["Joined", user.createdAt.toISOString()],
    ["Sign-in", user.passwordHash ? "password" : "Google"],
    ["Email confirmed", user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : "NO"],
    ["Logs / shelves", `${logs} / ${shelves}`],
    ["Session version", String(user.tokenVersion)],
  ];
  for (const [k, v] of rows) log(`${k.padEnd(16)} ${v}`);
  log(`Emails sent in the last 24h: ${recentTokens.length}`);
  for (const t of recentTokens) {
    log(`  ${t.createdAt.toISOString()}  ${t.purpose}${t.usedAt ? "  (used)" : ""}`);
  }
}

// For accounts we hand over rather than ones people sign up for (App
// Review's demo login, a tester): confirmed straight away, with a random
// password printed once on stdout. The owner can change it in Settings.
async function create(rawEmail: string | undefined, rawUsername: string | undefined) {
  const email = rawEmail?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email) || email.length > MAX_EMAIL) throw new Fail("Usage: create <email> [username]");
  if (await prisma.user.findUnique({ where: { email } })) throw new Fail(`${email} already has an account.`);
  let username: string | null = null;
  if (rawUsername) {
    username = normalizeUsername(rawUsername);
    const bad = usernameError(username);
    if (bad) throw new Fail(bad);
    if (await prisma.user.findUnique({ where: { username } })) throw new Fail(`@${username} is taken.`);
  }
  const password = randomBytes(15).toString("base64url");
  const user = await prisma.user.create({
    data: {
      email,
      username,
      name: username,
      passwordHash: await bcrypt.hash(password, 12),
      emailVerifiedAt: new Date(),
    },
  });
  process.stdout.write(`${password}\n`);
  log(`Created ${label(user)}, confirmed. The line above is its password; it isn't stored anywhere else.`);
}

async function sendReset(user: User) {
  if (!user.passwordHash) {
    throw new Fail(`${label(user)} signs in with Google; there's no password to reset.`);
  }
  const token = await issueToken(user.id, "RESET_PASSWORD", { skipCap: true });
  if (!token) throw new Fail("Couldn't create a reset link.");
  await sendPasswordResetEmail(user, token);
  log(`Reset link sent to ${user.email} (valid 30 minutes).`);
}

async function sendVerify(user: User) {
  if (user.emailVerifiedAt) throw new Fail(`${label(user)} is already confirmed.`);
  const token = await issueToken(user.id, "VERIFY_EMAIL", { skipCap: true });
  if (!token) throw new Fail("Couldn't create a confirmation link.");
  await sendVerifyEmail(user, token);
  log(`Confirmation link sent to ${user.email} (valid 24 hours).`);
}

async function verify(user: User) {
  if (user.emailVerifiedAt) throw new Fail(`${label(user)} is already confirmed.`);
  await markEmailVerified(user.id);
  log(`Marked ${label(user)} as confirmed.`);
}

async function revokeSessions(user: User) {
  await prisma.user.update({
    where: { id: user.id },
    data: { tokenVersion: { increment: 1 } },
  });
  log(`Signed ${label(user)} out on every device.`);
}

async function changeEmail(user: User, raw: string | undefined) {
  if (!user.passwordHash) {
    // Google sign-in matches on the Google address; moving it would orphan the login.
    throw new Fail(`${label(user)} signs in with Google, so its email follows their Google account.`);
  }
  const newEmail = raw?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(newEmail) || newEmail.length > MAX_EMAIL) {
    throw new Fail("Give a valid new email address.");
  }
  if (await prisma.user.findUnique({ where: { email: newEmail } })) {
    throw new Fail(`${newEmail} already has an account.`);
  }
  // The new address must be confirmed before it can sign in, which proves
  // the requester controls it.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { email: newEmail, emailVerifiedAt: null, tokenVersion: { increment: 1 } },
  });
  // Links already sent to the old inbox must not work on the moved account.
  await revokeTokens(user.id);
  await sendEmailChangedEmail(user, newEmail);
  const token = await issueToken(user.id, "VERIFY_EMAIL", { skipCap: true });
  if (!token) throw new Fail(`Moved ${label(user)} to ${newEmail}, but couldn't create a confirmation link; run send-verify.`);
  await sendVerifyEmail(updated, token);
  log(`Moved ${label(user)} to ${newEmail}; confirmation link sent there, notice sent to the old address.`);
}

async function exportData(user: User) {
  process.stdout.write(JSON.stringify(await buildExport(user.id), null, 2) + "\n");
  log(`Exported ${label(user)}.`);
}

async function deleteUser(user: User, flag: string | undefined) {
  if (flag !== "--yes") throw new Fail(`Add --yes to permanently delete ${label(user)}.`);
  await prisma.user.delete({ where: { id: user.id } });
  await sendAccountDeletedEmail(user);
  log(`Deleted ${label(user)}; confirmation emailed.`);
}

async function rename(user: User, raw: string | undefined) {
  const username = normalizeUsername(raw ?? "");
  const bad = usernameError(username);
  if (bad) throw new Fail(bad);
  if (await prisma.user.findUnique({ where: { username } })) throw new Fail(`@${username} is taken.`);
  await prisma.user.update({ where: { id: user.id }, data: { username } });
  log(`Renamed ${label(user)} to @${username}.`);
}

function siteUrl() {
  return (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "https://beaten.games").replace(/\/$/, "");
}

async function reserve(raw: string | undefined, note: string[]) {
  const username = normalizeUsername(raw ?? "");
  if (!username) throw new Fail("Usage: reserve <username> [note]");
  const bad = usernameError(username);
  if (bad) throw new Fail(`Can't reserve @${username}: ${bad}`);
  const owner = await prisma.user.findUnique({ where: { username } });
  if (owner) throw new Fail(`@${username} already belongs to ${owner.email}.`);
  const code = await reserveUsername(username, note.join(" ") || null);
  log(`Reserved @${username}${isBuiltInReserved(username) ? " (also on the built-in list)" : ""}.`);
  log("Send this link to the person it's for. It works once they sign up (email or Google)");
  log("or, if they already have an account, it lets them switch to the name in Settings:");
  process.stdout.write(`${siteUrl()}/register?invite=${code}\n`);
  log("Running reserve again for the same name replaces the link.");
}

async function unreserve(raw: string | undefined) {
  const username = normalizeUsername(raw ?? "");
  const { count } = await prisma.reservedUsername.deleteMany({ where: { username } });
  if (!count) throw new Fail(`@${username} isn't in the reserved list${isBuiltInReserved(username) ? " (it's on the built-in list in username-rules.ts)" : ""}.`);
  log(`Released @${username}.`);
}

async function reservations() {
  const rows = await prisma.reservedUsername.findMany({ orderBy: { createdAt: "desc" } });
  if (!rows.length) return log("No reserved usernames (besides the built-in list).");
  for (const r of rows) {
    const what = r.inviteHash
      ? `invite${r.note ? ` — ${r.note}` : ""}`
      : `held for previous owner until ${r.expiresAt?.toISOString().slice(0, 10) ?? "?"}`;
    process.stdout.write(`@${r.username}  ${what}\n`);
  }
}

async function checkUsernames() {
  const users = await prisma.user.findMany({ where: { username: { not: null } }, select: { email: true, username: true } });
  let found = 0;
  for (const u of users) {
    const problem = usernameError(u.username!) ?? (isBuiltInReserved(u.username!) ? "on the reserved list" : null);
    if (problem) {
      found++;
      process.stdout.write(`@${u.username}  ${u.email}  ${problem}\n`);
    }
  }
  log(found ? `${found} of ${users.length} usernames need a look (fix with: rename <who> <username>).` : `All ${users.length} usernames pass.`);
}

async function main(argv: string[]) {
  const [command, who, extra] = argv;
  switch (command) {
    case "create": return create(who, extra);
    case "rename": return rename(await findUser(who), extra);
    case "reserve": return reserve(who, argv.slice(2));
    case "unreserve": return unreserve(who);
    case "reservations": return reservations();
    case "check-usernames": return checkUsernames();
    case "find": return find(await findUser(who));
    case "send-reset": return sendReset(await findUser(who));
    case "send-verify": return sendVerify(await findUser(who));
    case "verify": return verify(await findUser(who));
    case "revoke-sessions": return revokeSessions(await findUser(who));
    case "change-email": return changeEmail(await findUser(who), extra);
    case "export": return exportData(await findUser(who));
    case "delete": return deleteUser(await findUser(who), extra);
    default: throw new Fail(USAGE);
  }
}

main(process.argv.slice(2))
  .catch((e) => {
    log(e instanceof Fail ? e.message : `Failed: ${e instanceof Error ? e.stack : e}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
