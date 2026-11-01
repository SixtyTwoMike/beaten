import { apiError, apiJson, apiRoute, readJson } from "@/lib/api";
import { registerAccount } from "@/lib/register";

// POST /api/v1/auth/register {name, username, email, password} → {ok}
// As the web's sign-up: the answer is "check your email" whether or not the
// address already has an account; sign in once it's confirmed.
export const POST = apiRoute("api register", async (request: Request) => {
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const result = await registerAccount({
    name: str(body.name),
    username: str(body.username),
    email: str(body.email),
    password: str(body.password),
  });
  if (!result.ok) return apiError(result.error);
  return apiJson({ ok: true });
});
