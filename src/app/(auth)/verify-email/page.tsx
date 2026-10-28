import type { Metadata } from "next";
import { VerifyEmailForm } from "@/components/AccountForms";

export const metadata: Metadata = {
  title: "Confirm your email — Beaten",
  referrer: "no-referrer",
};

// Confirmation is a button press (POST), not the page load, so link
// scanners in mail clients can't use up the token by fetching the URL.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return <VerifyEmailForm token={token} />;
}
