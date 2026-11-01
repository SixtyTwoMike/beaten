// Checks when notification emails go out (lib/notifications.ts), straight
// against the dev database; emails land in .dev-outbox. Run: npx tsx scripts/notify.check.mts
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { sendNotificationEmails } from "../src/lib/notifications";

const t = Date.now().toString(36);
const mk = (n: string, extra = {}) =>
  prisma.user.create({ data: { email: `${n}${t}@example.com`, username: `${n}${t}`, emailVerifiedAt: new Date(), ...extra } });
let fails = 0;
const check = (name: string, ok: boolean, d?: unknown) => { console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : " " + JSON.stringify(d)}`); if (!ok) fails++; };
const outbox = () => readFileSync(".dev-outbox/outbox.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));

const game = await prisma.game.findFirstOrThrow();
const author = await mk("nauth", { notifyComments: "instant", notifyReactions: "daily" });
const fan = await mk("nfan", { name: "Fan" });
const log = await prisma.playLog.create({ data: { userId: author.id, gameId: game.id, status: "BEATEN", reviewText: "Good" } });
const comment = await prisma.comment.create({ data: { playLogId: log.id, authorId: fan.id, body: "Love this review" } });
const ago = (ms: number) => new Date(Date.now() - ms);
try {
  await prisma.notification.create({ data: { userId: author.id, actorId: fan.id, type: "COMMENT", playLogId: log.id, commentId: comment.id, createdAt: ago(5 * 60e3) } });
  await prisma.notification.create({ data: { userId: author.id, actorId: fan.id, type: "REACTION", reaction: "fire", playLogId: log.id, createdAt: ago(60 * 60e3) } });
  const before = outbox().length;
  await sendNotificationEmails();
  const sent = outbox().slice(before).filter((e) => e.to === author.email);
  check("instant comment emailed, daily reaction held back", sent.length === 1 && sent[0].subject.includes("commented on your review") && !sent[0].text.includes("reacted"), sent);
  check("email links to the review and settings", sent[0]?.text.includes(`/${author.username}/reviews/${log.id}`) && sent[0]?.text.includes("/settings#notifications"));
  await sendNotificationEmails();
  check("not emailed twice", outbox().slice(before).filter((e) => e.to === author.email).length === 1);
  await prisma.notification.updateMany({ where: { userId: author.id, type: "REACTION" }, data: { createdAt: ago(25 * 3600e3) } });
  await prisma.notification.create({ data: { userId: author.id, actorId: fan.id, type: "REACTION", reaction: "heart", playLogId: log.id, createdAt: ago(3600e3) } });
  await sendNotificationEmails();
  const daily = outbox().slice(before).filter((e) => e.to === author.email);
  check("daily summary once the oldest is a day old, with everything since", daily.length === 2 && daily[1].subject === "2 reactions on your reviews", daily[1]);
  await prisma.notification.create({ data: { userId: author.id, actorId: fan.id, type: "COMMENT", commentId: comment.id, playLogId: log.id, createdAt: ago(10 * 60e3), readAt: new Date() } });
  await prisma.user.update({ where: { id: author.id }, data: { notifyComments: "off" } });
  await prisma.notification.create({ data: { userId: author.id, actorId: fan.id, type: "COMMENT", commentId: comment.id, playLogId: log.id, createdAt: ago(10 * 60e3) } });
  await sendNotificationEmails();
  check("seen ones and turned-off types aren't emailed", outbox().slice(before).filter((e) => e.to === author.email).length === 2);
  await prisma.block.create({ data: { blockerId: author.id, blockedId: fan.id } });
  await prisma.user.update({ where: { id: author.id }, data: { notifyComments: "instant" } });
  await sendNotificationEmails();
  check("blocked people's aren't emailed", outbox().slice(before).filter((e) => e.to === author.email).length === 2);
} finally {
  await prisma.user.deleteMany({ where: { id: { in: [author.id, fan.id] } } });
  await prisma.$disconnect();
}
console.log(fails ? `${fails} failed` : "All notification email checks passed");
process.exit(fails ? 1 : 0);
