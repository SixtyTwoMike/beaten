import { appUrl, sendEmail } from "./email";

// Wording for account emails. Plain text; links are absolute.

type Recipient = { email: string; name: string | null };

const SIGN_OFF = "\n\n— Beaten\n" + appUrl();

function greet(user: Recipient) {
  return `Hi ${user.name || "there"},\n\n`;
}

export function sendVerifyEmail(user: Recipient, token: string) {
  return sendEmail({
    to: user.email,
    subject: "Confirm your email for Beaten",
    text:
      greet(user) +
      "Confirm your email address to finish setting up your Beaten account:\n\n" +
      `${appUrl()}/verify-email?token=${token}\n\n` +
      "The link works for 24 hours. If you didn't sign up, you can ignore this email." +
      SIGN_OFF,
  });
}

export function sendAlreadyRegisteredEmail(user: Recipient) {
  return sendEmail({
    to: user.email,
    subject: "You already have a Beaten account",
    text:
      greet(user) +
      "Someone (hopefully you) tried to create a new Beaten account with this email, " +
      "but you already have one.\n\n" +
      `Sign in: ${appUrl()}/login\n` +
      `Forgot your password? ${appUrl()}/forgot-password\n\n` +
      "If this wasn't you, no action is needed — nothing has changed." +
      SIGN_OFF,
  });
}

export function sendPasswordResetEmail(user: Recipient, token: string) {
  return sendEmail({
    to: user.email,
    subject: "Reset your Beaten password",
    text:
      greet(user) +
      "Use this link to choose a new password:\n\n" +
      `${appUrl()}/reset-password?token=${token}\n\n` +
      "It works once, for 30 minutes. If you didn't ask for this, ignore this " +
      "email — your password won't change." +
      SIGN_OFF,
  });
}

export function sendGoogleAccountEmail(user: Recipient) {
  return sendEmail({
    to: user.email,
    subject: "Signing in to Beaten",
    text:
      greet(user) +
      "Someone asked to reset the password for this email, but your Beaten account " +
      "signs in with Google — there's no password to reset.\n\n" +
      `Use "Continue with Google" at ${appUrl()}/login` +
      SIGN_OFF,
  });
}

export function sendPasswordChangedEmail(user: Recipient) {
  return sendEmail({
    to: user.email,
    subject: "Your Beaten password was changed",
    text:
      greet(user) +
      "The password for your Beaten account was just changed, and you've been " +
      "signed out on every device.\n\n" +
      "If this wasn't you, reset your password now and contact us:\n" +
      `${appUrl()}/forgot-password\n${appUrl()}/support` +
      SIGN_OFF,
  });
}

export function sendAccountDeletedEmail(user: Recipient) {
  return sendEmail({
    to: user.email,
    subject: "Your Beaten account has been deleted",
    text:
      greet(user) +
      "Your Beaten account and everything in it — logs, reviews, shelves and " +
      "your public profile — have been permanently deleted.\n\n" +
      `If you didn't do this, contact us right away: ${appUrl()}/support` +
      SIGN_OFF,
  });
}

// Sent to the old address when support moves an account to a new email.
export function sendEmailChangedEmail(user: Recipient, newEmail: string) {
  return sendEmail({
    to: user.email,
    subject: "Your Beaten email address was changed",
    text:
      greet(user) +
      `At your request, the email for your Beaten account is now ${newEmail}, ` +
      "and you've been signed out on every device.\n\n" +
      `If you didn't ask for this, contact us right away: ${appUrl()}/support` +
      SIGN_OFF,
  });
}
