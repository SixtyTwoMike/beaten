// Where people reach us. support@ is on the iCloud+ custom email domain;
// requests are handled per docs/support-playbook.md.
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "support@beaten.games";

// Umami analytics, self-hosted on the same box (deploy/umami.sh): no
// cookies, no personal data. The id isn't a secret (it's in every page).
export const UMAMI_WEBSITE_ID = "fc779b6b-f9bf-4584-82f5-bc5a7fa9d101";
