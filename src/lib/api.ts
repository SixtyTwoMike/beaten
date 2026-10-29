import { NextResponse } from "next/server";
import { resolveApiToken } from "./api-tokens";

// Helpers for the iPhone app's JSON API (/api/v1). Requests carry
// "Authorization: Bearer <token>"; errors are {error} with an HTTP status.

const NO_STORE = { "Cache-Control": "no-store" };

export function apiJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function apiError(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export type ApiUser = { userId: string; tokenId: string };

// The signed-in user, or a 401 response to return as is:
//   const auth = await requireApiUser(request);
//   if (auth instanceof Response) return auth;
export async function requireApiUser(request: Request): Promise<ApiUser | Response> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (\S+)$/.exec(header);
  const found = match ? await resolveApiToken(match[1]) : null;
  if (!found) return apiError("Not signed in", 401);
  return { userId: found.userId, tokenId: found.id };
}

// The request body as an object, or null when it isn't JSON (or too big).
const MAX_BODY = 64 * 1024;
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return null;
    const body: unknown = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Wraps a handler so an unexpected throw becomes a logged 500 with a plain
// message, not an HTML error page.
export function apiRoute<A extends unknown[]>(label: string, handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      console.error(`${label} failed:`, e);
      return apiError("Something went wrong", 500);
    }
  };
}
