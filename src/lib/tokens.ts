import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";

// Single-use emailed tokens. The raw token only ever exists in the email;
// the database keeps its SHA-256.

export type TokenPurpose = "RESET_PASSWORD" | "VERIFY_EMAIL";

const TTL_MS: Record<TokenPurpose, number> = {
  RESET_PASSWORD: 30 * 60 * 1000,
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
};

// Per-account cap on emails of each kind, so the forms can't be used to
// flood someone's inbox.
const MAX_PER_HOUR = 3;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Returns the raw token to email, or null when the hourly cap is reached.
// Support (the admin CLI) skips the cap: public forms could otherwise use it
// up and block a recovery.
export async function issueToken(
  userId: string,
  purpose: TokenPurpose,
  options: { skipCap?: boolean } = {}
): Promise<string | null> {
  if (!options.skipCap) {
    const recent = await prisma.authToken.count({
      where: { userId, purpose, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (recent >= MAX_PER_HOUR) return null;
  }
  const token = randomBytes(32).toString("base64url");
  await prisma.authToken.create({
    data: {
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TTL_MS[purpose]),
    },
  });
  return token;
}

// The token's row if it's unused, unexpired, and for this purpose.
export async function findValidToken(token: string, purpose: TokenPurpose) {
  if (!token || token.length > 100) return null;
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) {
    return null;
  }
  return row;
}

// Marks the token used (exactly once, even under concurrent requests) and
// voids the account's other outstanding tokens of the same kind.
export async function consumeToken(token: string, purpose: TokenPurpose) {
  const row = await findValidToken(token, purpose);
  if (!row) return null;
  const { count } = await prisma.authToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count !== 1) return null;
  await prisma.authToken.deleteMany({
    where: { userId: row.userId, purpose, usedAt: null },
  });
  return row;
}

// Voids unused tokens (all, or of one kind), e.g. after a password or email
// change, so links already sent can't undo it.
export async function revokeTokens(userId: string, purpose?: TokenPurpose) {
  await prisma.authToken.deleteMany({
    where: { userId, usedAt: null, ...(purpose ? { purpose } : {}) },
  });
}
