import { notFound } from "next/navigation";
import { prisma } from "./db";
import { auth } from "./auth";

// The web admin is for the accounts listed in ADMIN_EMAILS (comma-separated,
// set in the server's env file, never in source). The address must be the
// account's verified email; anyone else gets a 404, so /admin isn't
// advertised.

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function isAdmin(userId: string): Promise<boolean> {
  const allowed = adminEmails();
  if (!allowed.size) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } });
  return Boolean(u?.email && u.emailVerifiedAt && allowed.has(u.email.toLowerCase()));
}

// For admin pages: 404 for everyone else.
export async function requireAdminPage(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id || !(await isAdmin(id))) notFound();
  return id;
}

// For admin server actions: throws for everyone else.
export async function requireAdminId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id || !(await isAdmin(id))) throw new Error("Not authorised");
  return id;
}
