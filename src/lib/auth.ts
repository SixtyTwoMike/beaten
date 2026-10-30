import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { admitOAuthEmail, checkPassword, upsertOAuthUser } from "./account-auth";
import { appleCookies, appleProviders } from "./apple-auth";
import { prisma } from "./db";

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
      const result = await checkPassword(credentials?.email, credentials?.password);
      if (result === "invalid") return null;
      if (result === "unverified") throw new EmailNotVerified();
      const user = result;
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
      return admitOAuthEmail(profile.email);
    },
    async jwt({ token, user, account }) {
      // Runs with `user` defined only on sign-in.
      if (user) {
        if (account && OAUTH_PROVIDERS.includes(account.provider) && user.email) {
          const dbUser = await upsertOAuthUser(user.email, user.name ?? null, user.image ?? null);
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
