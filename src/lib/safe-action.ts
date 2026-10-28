// Client-side wrapper for server actions. When nginx rate limits a POST
// (HTML 429) or the connection drops, the action call throws instead of
// returning a result; turn that into an ordinary form error.

export const REQUEST_FAILED =
  "Couldn't reach Beaten. You may have tried too many times, or lost your connection — wait a minute and try again.";

export async function safeAction<T>(call: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await call();
  } catch (e) {
    console.error("action failed:", e);
    return { ok: false, error: REQUEST_FAILED };
  }
}
