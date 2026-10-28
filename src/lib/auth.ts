import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      // Only trust addresses Google has verified, and never attach a Google
      // login to a confirmed password account: whoever registered that
      // address with a password would keep access alongside it.
      if (profile?.email_verified !== true || !profile.email) return false;
      const existing = await prisma.user.findUnique({
        where: { email: profile.email.toLowerCase() },
        select: { id: true, passwordHash: true, emailVerifiedAt: true },
      });
      if (!existing?.passwordHash) return true;
      if (existing.emailVerifiedAt) return false;
      // An unconfirmed password sign-up on this address may not be the
      // owner's. Google has now proved ownership: drop the password and
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
        if (account?.provider === "google" && user.email) {
          const dbUser = await prisma.user.upsert({
            where: { email: user.email.toLowerCase() },
            update: { name: user.name ?? undefined, image: user.image ?? undefined },
            create: {
              email: user.email.toLowerCase(),
              name: user.name,
              image: user.image,
              // signIn() only admits Google addresses marked email_verified.
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
});
