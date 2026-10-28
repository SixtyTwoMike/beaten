import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { SUPPORT_EMAIL } from "./site";

// Transactional email via Resend's HTTP API (plain text only, so no HTML
// escaping concerns). In development, emails go to .dev-outbox/outbox.jsonl
// instead (the smoke test reads links from there) unless EMAIL_SEND_IN_DEV=1.

export type Email = { to: string; subject: string; text: string };

const FROM = process.env.EMAIL_FROM ?? "Beaten <noreply@beaten.games>";

export function appUrl(): string {
  return (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export async function sendEmail(email: Email): Promise<void> {
  if (process.env.NODE_ENV !== "production" && process.env.EMAIL_SEND_IN_DEV !== "1") {
    const dir = path.join(process.cwd(), ".dev-outbox");
    await mkdir(dir, { recursive: true });
    await appendFile(
      path.join(dir, "outbox.jsonl"),
      JSON.stringify({ ...email, sentAt: new Date().toISOString() }) + "\n"
    );
    console.log(`[email] (dev outbox) to ${email.to}: ${email.subject}`);
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY not set; not sent: "${email.subject}"`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [email.to],
      reply_to: SUPPORT_EMAIL, // replies to noreply@ reach a person
      subject: email.subject,
      text: email.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
}
