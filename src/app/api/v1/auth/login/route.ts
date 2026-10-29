import { checkPassword } from "@/lib/accounts";
import { apiError, apiJson, apiRoute, readJson } from "@/lib/api";
import { issueApiToken } from "@/lib/api-tokens";
import { meJson } from "@/lib/api-me";

// POST /api/v1/auth/login {email, password, deviceName?} → {token, me}
// Same checks and per-account limits as the web sign-in.
export const POST = apiRoute("api login", async (request: Request) => {
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const result = await checkPassword(body.email, body.password);
  if (result === "invalid") return apiError("Email or password is incorrect", 401);
  if (result === "unverified") {
    return apiError("Confirm your email address first — check your inbox for the link", 403);
  }
  const token = await issueApiToken(result.id, body.deviceName);
  return apiJson({ token, me: await meJson(result.id) });
});
