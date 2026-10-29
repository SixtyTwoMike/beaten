import { NextResponse, type NextRequest } from "next/server";
import { signIn } from "@/lib/auth";
import { appUrl } from "@/lib/email";

// POST /api/sign-in/google|apple — the "Continue with …" buttons are plain
// forms posting here, and we answer with a redirect to the provider. A real
// page navigation, rather than Auth.js's fetch-then-set-location, which iOS
// Safari sometimes doesn't follow. Same-origin only.
const PROVIDERS = ["google", "apple"];

export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!PROVIDERS.includes(provider)) return new NextResponse(null, { status: 404 });
  if (request.headers.get("origin") !== new URL(appUrl()).origin) return new NextResponse(null, { status: 403 });
  const form = await request.formData();
  const raw = String(form.get("callbackUrl") ?? "/");
  // Only paths on this site.
  const callbackUrl = raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") ? raw : "/";
  const url = await signIn(provider, { redirectTo: callbackUrl, redirect: false });
  return NextResponse.redirect(url, 303);
}
