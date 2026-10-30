import { after } from "next/server";
import { deleteAccountForUser } from "@/lib/account-auth";
import { sendAccountDeletedEmail } from "@/lib/account-emails";
import { apiError, apiJson, apiRoute, readJson, requireApiUser } from "@/lib/api";

// DELETE /api/v1/account {confirmation} — the password, or for Apple/Google
// accounts their username or email (see me.hasPassword). Same rules as
// Settings on the web.
export const DELETE = apiRoute("api delete account", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const result = await deleteAccountForUser(auth.userId, body.confirmation as string);
  if (!result.ok) return apiError(result.error, 403);
  after(() => sendAccountDeletedEmail(result.user).catch((e) => console.error("account deleted email failed:", e)));
  return apiJson({ ok: true });
});
