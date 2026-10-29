import { admitOAuthEmail, upsertOAuthUser } from "@/lib/accounts";
import { apiError, apiJson, apiRoute, readJson } from "@/lib/api";
import { issueApiToken } from "@/lib/api-tokens";
import { meJson } from "@/lib/api-me";
import { verifyAppleIdentityToken } from "@/lib/apple-native";
import { MAX_NAME } from "@/lib/limits";

// POST /api/v1/auth/apple {identityToken, nonce, name?, deviceName?} → {token, me}
// Native Sign in with Apple. Accounts are matched by verified email, with the
// same rules as the web's Apple and Google sign-in (lib/accounts).
export const POST = apiRoute("api apple sign-in", async (request: Request) => {
  const body = await readJson(request);
  if (!body || typeof body.identityToken !== "string" || typeof body.nonce !== "string") {
    return apiError("Invalid request");
  }
  const verified = await verifyAppleIdentityToken(body.identityToken, body.nonce);
  if (!verified.ok) return apiError(verified.error, 401);
  const { email } = verified.identity;
  if (!(await admitOAuthEmail(email))) {
    return apiError("This email already has a Beaten password. Sign in with your email and password instead.", 409);
  }
  // Apple only gives the app the name on the very first sign-in.
  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME) || null : null;
  const user = await upsertOAuthUser(email, name, null);
  const token = await issueApiToken(user.id, body.deviceName);
  return apiJson({ token, me: await meJson(user.id) });
});
