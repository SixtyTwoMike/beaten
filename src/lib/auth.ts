import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { appleCookies, appleProviders } from "./apple-auth";
import { prisma } from "./db";
import { PASSWORD_ATTEMPTS, clearAttempts, isLimited, recordAttempt } from "./rate-limit";

// Compared against when the email is unknown, so a failed sign-in takes the
// same bcrypt time whether or not the account exists.
const DUMMY_HASH = "$2b$12$bcZWFlt4lprVdx1DlBLZL.VPJAXEI.1FjI1.hT0Acr7FBLUp1Qmhu";

// Right password, but the address hasn't been confirmed yet. Only reachable
// with the correct password, so it doesn't help enumerate accounts.
class EmailNotVerified extends CredentialsSignin {
  code = "email_not_verified";
}

// Sessions expire after 14 days instead of Auth.js's 30-day default.
const SESSION_MAX_AGE = 14 * 24 * 60 * 60;

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = String(credentials?.email ?? "")
        .trim()
        .toLowerCase();
      const password = String(credentials?.password ?? "");
      if (!email || !password || email.length > 254 || password.length > 128) {
        return null;
      }
      // Per-account guess limit (nginx limits per IP). Keyed by email so
      // unknown addresses behave the same; still runs bcrypt so a limited
      // account answers in the usual time.
      const attemptKey = `login:${email}`;
      const limited = isLimited(attemptKey, PASSWORD_ATTEMPTS);
      const user = await prisma.user.findUnique({ where: { email } });
      const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
      if (limited) return null;
      if (!user?.passwordHash || !valid) {
        recordAttempt(attemptKey, PASSWORD_ATTEMPTS);
        return null;
      }
      clearAttempts(attemptKey);
      if (!user.emailVerifiedAt) throw new EmailNotVerified();
      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
];

export const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

if (googleEnabled) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

// Google and Apple sign-ins: matched to accounts by verified email.
const OAUTH_PROVIDERS = ["google", "apple"];

// Lazy so Apple's client secret is remade before it expires (lib/apple-auth).
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  pages: { signIn: "/login" },
  providers: [...providers, ...appleProviders()],
  cookies: appleCookies((process.env.AUTH_URL ?? "").startsWith("https://")),
  callbacks: {
    async signIn({ account, profile }) {
      if (!account || !OAUTH_PROVIDERS.includes(account.provider)) return true;
      // Only trust addresses the provider has verified (Apple sends "true"
      // as a string), and never attach such a login to a confirmed password
      // account: whoever registered that address with a password would keep
      // access alongside it.
      const flag: unknown = profile?.email_verified;
      const verified = flag === true || flag === "true";
      if (!verified || !profile?.email) return false;
      const existing = await prisma.user.findUnique({
        where: { email: profile.email.toLowerCase() },
        select: { id: true, passwordHash: true, emailVerifiedAt: true },
      });
      if (!existing?.passwordHash) return true;
      if (existing.emailVerifiedAt) return false;
      // An unconfirmed password sign-up on this address may not be the
      // owner's. Google/Apple has now proved ownership: drop the password and
      // anything the sign-up chose, and void its links and sessions.
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: null,
          pendingUsername: null,
          emailVerifiedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      });
      await prisma.authToken.deleteMany({ where: { userId: existing.id } });
      return true;
    },
    async jwt({ token, user, account }) {
      // Runs with `user` defined only on sign-in.
      if (user) {
        if (account && OAUTH_PROVIDERS.includes(account.provider) && user.email) {
          const dbUser = await prisma.user.upsert({
            where: { email: user.email.toLowerCase() },
            update: { name: user.name ?? undefined, image: user.image ?? undefined },
            create: {
              email: user.email.toLowerCase(),
              name: user.name,
              image: user.image,
              // signIn() only admits addresses marked email_verified.
              emailVerifiedAt: new Date(),
            },
          });
          token.uid = dbUser.id;
        } else {
          token.uid = user.id;
        }
        const fresh = await prisma.user.findUnique({
          where: { id: token.uid as string },
          select: { tokenVersion: true },
        });
        token.tv = fresh?.tokenVersion ?? 0;
        return token;
      }
      // Every later request: reject sessions for deleted users or ones
      // revoked by "sign out everywhere".
      if (!token.uid) return null;
      const current = await prisma.user.findUnique({
        where: { id: token.uid as string },
        select: { tokenVersion: true },
      });
      if (!current || current.tokenVersion !== token.tv) return null;
      return token;
    },
    async session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = token.uid as string;
      }
      return session;
    },
  },
}));
