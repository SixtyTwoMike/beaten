import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { findValidToken } from "@/lib/tokens";
import { ResetPasswordForm } from "@/components/AccountForms";

// The token is in the URL: never leak it to other sites via Referer.
export const metadata: Metadata = {
  title: "Choose a new password — Beaten",
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const valid = await findValidToken(token, "RESET_PASSWORD");
  if (!valid) {
    return (
      <div className="w-full max-w-sm rounded-xl border border-edge bg-card p-6 text-sm shadow-xl">
        <h1 className="mb-2 text-lg font-semibold">Link expired</h1>
        <p className="text-fog">
          This reset link has expired or was already used. Links work once, for
          30 minutes.
        </p>
        <Link href="/forgot-password" className="mt-4 inline-block text-mint hover:underline">
          Send a new link
        </Link>
      </div>
    );
  }
  const user = await prisma.user.findUnique({
    where: { id: valid.userId },
    select: { email: true },
  });
  if (!user) notFound();
  return <ResetPasswordForm token={token} email={user.email} />;
}
