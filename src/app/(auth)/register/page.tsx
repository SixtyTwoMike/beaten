import { redirect } from "next/navigation";
import { auth, googleEnabled } from "@/lib/auth";
import { usernameForInvite } from "@/lib/reserved-usernames";
import { RegisterForm } from "@/components/AuthForms";

export const metadata = { title: "Create account — Beaten" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite: code } = await searchParams;
  const session = await auth();
  // Invite links work for existing accounts too: claim the name in Settings.
  if (session?.user) redirect(code ? `/settings?invite=${encodeURIComponent(code)}` : "/");
  const username = code ? await usernameForInvite(code) : null;
  return (
    <RegisterForm
      googleEnabled={googleEnabled}
      invite={code && username ? { code, username } : null}
    />
  );
}
