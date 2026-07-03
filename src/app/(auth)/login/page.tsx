import { redirect } from "next/navigation";
import { auth, googleEnabled } from "@/lib/auth";
import { LoginForm } from "@/components/AuthForms";

export const metadata = { title: "Sign in — Beaten" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  return <LoginForm googleEnabled={googleEnabled} />;
}
