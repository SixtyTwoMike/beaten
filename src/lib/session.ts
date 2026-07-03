import { redirect } from "next/navigation";
import { auth } from "./auth";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

// For pages: redirects to /login when unauthenticated.
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user as SessionUser;
}

// For server actions and API routes: throws instead of redirecting.
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user.id;
}
