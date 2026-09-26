import PostHog from "posthog-react-native";
import { Platform } from "react-native";

/**
 * The client-side funnel (#225): where people stop between opening the app
 * and signing up. PostHog, decided by the owner on 24 September 2026.
 *
 * **Disjoint from the scan log (#236).** The server already records what
 * happened to each scan — outcome, names parsed and resolved. This records
 * only what happened on the phone. Nothing here re-sends OCR accuracy, and
 * the funnel is never derived from the scan log, so two systems never count
 * the same thing differently.
 *
 * **The content rule.** No ingredient list, product name, barcode, image or
 * profile field — concerns, skin type, sensitivity, pregnancy status — ever
 * goes in an event or on a person. The events and every property they can
 * carry are closed lists below (`EVENTS`), each property a fixed set of
 * values; `__tests__/analytics.test.ts` fails if a free-text property or a
 * forbidden name ever appears. There are no person properties at all.
 *
 * **Never affects the app.** Events queue on the device and send in the
 * background; every call here swallows its own errors. A scan in a shop
 * with no signal is never delayed, blocked or shown an error by this file.
 *
 * **Identity.** A guest is PostHog's own random id, generated on the device
 * — never a device identifier, never an advertising id (the SDK reads
 * neither, so there is no App Tracking Transparency prompt). Signing in
 * links that id to the account id, so the funnel can count sign-ups; it is
 * the moment a guest's earlier events become attributable to an account,
 * which docs/privacy-disclosures.md and the Privacy screen say plainly.
 * Signing out starts a fresh random id, so the next person on the phone is
 * never linked to the last.
 *
 * Off unless `EXPO_PUBLIC_POSTHOG_KEY` is set (a project key is public by
 * design, like the Supabase anon key).
 */

/** Every event, and the only values each of its properties may take. */
export const EVENTS = {
  /** A barcode was read or a label photo taken — the top of the funnel. */
  scan_started: { path: ["barcode", "label"] },
  /** A verdict was shown for a product. */
  verdict_viewed: { path: ["barcode", "label", "browse"] },
  /** The Save heart or ingredient star was tapped to add. */
  save_tapped: { target: ["product", "ingredient"], signed_in: [true, false] },
  /** The sign-in sheet opened, and from where. */
  sign_in_shown: { from: ["account", "shelf"] },
  /** A session began from the sign-in sheet — a new account or a returning one. */
  signed_in: { provider: ["apple", "google"], new_account: [true, false] },
} as const;

export type EventName = keyof typeof EVENTS;
type Props<E extends EventName> = { [K in keyof (typeof EVENTS)[E]]: (typeof EVENTS)[E][K] extends readonly (infer V)[] ? V : never };

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
/** EU hosting by default: the app's users are largely in the EU (#14). */
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

let client: PostHog | null = null;

function posthog(): PostHog | null {
  if (!KEY) return null;
  if (client) return client;
  try {
    client = new PostHog(KEY, {
      host: HOST,
      // Only the events above. No screen names (a route can carry a product
      // id), no touches, no session replay.
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      // Where someone is doesn't answer either funnel question.
      disableGeoip: true,
      // Web keeps nothing on disk: the SDK's web storage is localStorage,
      // which docs/device-storage-policy.md rules out. On a phone it keeps
      // its queue and random id in its own file, not AsyncStorage.
      persistence: Platform.OS === "web" ? "memory" : "file",
    });
  } catch {
    client = null;
  }
  return client;
}

/** Records one funnel event. Never throws, never waits. */
export function track<E extends EventName>(event: E, properties: Props<E>): void {
  try {
    posthog()?.capture(event, properties as Record<string, string | boolean>);
  } catch {
    // Analytics never affects the app.
  }
}

/**
 * Links this phone's random id to the account — the funnel's one join.
 * The account id only: no email, no name, no properties.
 */
export function identifyAccount(accountId: string): void {
  try {
    posthog()?.identify(accountId);
  } catch {
    // Analytics never affects the app.
  }
}

/** Signed out or deleted: a fresh random id, linked to nobody. */
export function forgetAccount(): void {
  try {
    posthog()?.reset();
  } catch {
    // Analytics never affects the app.
  }
}
