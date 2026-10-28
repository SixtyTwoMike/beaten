// Support commands for account queries. Runs on the server as
// `sudo beaten-admin <command> ...` (installed by install-from-bundle.sh);
// from your Mac use ./deploy/admin.sh. See docs/support-playbook.md.
//
// Compiled to CommonJS by tsconfig.admin.json so it can reuse the app's own
// token, email and export code without a bundler. Messages go to stderr;
// stdout carries only command output (export JSON), so it can be redirected.

import { prisma } from "../src/lib/db";
import { issueToken } from "../src/lib/tokens";
import { buildExport } from "../src/lib/export";
import { MAX_EMAIL } from "../src/lib/limits";
import { normalizeUsername } from "../src/lib/username";
import {
  sendAccountDeletedEmail,
  sendEmailChangedEmail,
  sendPasswordResetEmail,
  sendVerifyEmail,
} from "../src/lib/account-emails";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USAGE = `Usage: beaten-admin <command> <email | username>

  find <who>                     account summary (no secrets)
  send-reset <who>               email a password reset link
  send-verify <who>              email a new confirmation link
  verify <who>                   mark the email confirmed without a link
  revoke-sessions <who>          sign the account out everywhere
  change-email <who> <new>       move to a new address (re-confirm required)
  export <who>                   print the account's data export (JSON)
  delete <who> --yes             permanently delete the account

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

async function sendReset(user: User) {
  if (!user.passwordHash) {
    throw new Fail(`${label(user)} signs in with Google; there's no password to reset.`);
  }
  const token = await issueToken(user.id, "RESET_PASSWORD");
  if (!token) throw new Fail("Hourly email limit reached for this account; try again later.");
  await sendPasswordResetEmail(user, token);
  log(`Reset link sent to ${user.email} (valid 30 minutes).`);
}

async function sendVerify(user: User) {
  if (user.emailVerifiedAt) throw new Fail(`${label(user)} is already confirmed.`);
  const token = await issueToken(user.id, "VERIFY_EMAIL");
  if (!token) throw new Fail("Hourly email limit reached for this account; try again later.");
  await sendVerifyEmail(user, token);
  log(`Confirmation link sent to ${user.email} (valid 24 hours).`);
}

async function verify(user: User) {
  if (user.emailVerifiedAt) throw new Fail(`${label(user)} is already confirmed.`);
  await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
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
  await sendEmailChangedEmail(user, newEmail);
  const token = await issueToken(user.id, "VERIFY_EMAIL");
  if (token) await sendVerifyEmail(updated, token);
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

async function main(argv: string[]) {
  const [command, who, extra] = argv;
  switch (command) {
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
