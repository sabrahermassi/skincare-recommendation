// Deleting the account's analytics person from PostHog (#24), through its
// persons API:
// https://posthog.com/docs/api/persons — POST /api/projects/:id/persons/bulk_delete/
//
// On sign-in the app links its random analytics id to the account id
// (`identifyAccount` in lib/analytics.ts), so the account id is the person's
// distinct id, and deleting that person takes the events from before sign-in
// with it. The app's own `reset()` only forgets the id on the phone; the
// person and its events stay in PostHog until this runs.
//
// It never decides whether the account is deleted: by the time it runs the
// account is gone, and a PostHog outage must not undo that or report it as a
// failure. A failure is logged for the operator to finish by hand.
//
// Secrets (function environment, never EXPO_PUBLIC_):
//   POSTHOG_PERSONAL_API_KEY — a personal API key with the person:write scope
//   POSTHOG_PROJECT_ID
//   POSTHOG_API_HOST — optional; the EU app host by default. Not the
//     ingestion host the app sends events to (eu.i.posthog.com).

import type { AnalyticsForget } from "./handler.ts";

export type PostHogKeys = { apiKey: string; projectId: string; host: string };

const DEFAULT_HOST = "https://eu.posthog.com";

export function postHogKeysFrom(get: (name: string) => string | undefined): PostHogKeys | null {
  const apiKey = get("POSTHOG_PERSONAL_API_KEY");
  const projectId = get("POSTHOG_PROJECT_ID");
  if (!apiKey || !projectId) return null;
  return { apiKey, projectId, host: (get("POSTHOG_API_HOST") || DEFAULT_HOST).replace(/\/+$/, "") };
}

/** Deletes the person whose distinct id is `accountId`, with their events and recordings. */
export async function deletePostHogPerson(
  keys: PostHogKeys | null,
  accountId: string,
  fetcher: typeof fetch = fetch,
): Promise<AnalyticsForget> {
  if (!keys) return "not-configured";
  try {
    const response = await fetcher(`${keys.host}/api/projects/${encodeURIComponent(keys.projectId)}/persons/bulk_delete/`, {
      method: "POST",
      headers: { authorization: `Bearer ${keys.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ distinct_ids: [accountId], delete_events: true, delete_recordings: true }),
      signal: AbortSignal.timeout(8000),
    });
    return response.ok ? "deleted" : "failed";
  } catch {
    return "failed";
  }
}
