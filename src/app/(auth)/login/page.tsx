import { redirect } from "next/navigation";
import { auth, googleEnabled } from "@/lib/auth";
import { LoginForm } from "@/components/AuthForms";

export const metadata = { title: "Sign in — Beaten" };

// One-off notices shown above the form after redirects from other flows.
const NOTICES: Record<string, string> = {
  changed: "Password changed. Sign in with your new password.",
  reset: "Password reset. Sign in with your new password.",
  verified: "Email confirmed — you can sign in now.",
  deleted: "Your account has been deleted.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");
  const params = await searchParams;
  const notice = Object.keys(NOTICES).find((key) => params[key] === "1");
  return (
    <LoginForm
      googleEnabled={googleEnabled}
      notice={notice ? NOTICES[notice] : null}
    />
  );
}
