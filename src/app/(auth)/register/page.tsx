import { redirect } from "next/navigation";
import { auth, googleEnabled } from "@/lib/auth";
import { RegisterForm } from "@/components/AuthForms";

export const metadata = { title: "Create account — Beaten" };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  return <RegisterForm googleEnabled={googleEnabled} />;
}
