import { Redirect } from "expo-router";

import { CONSENT_LAUNCH_HREF, needsConsent } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

/**
 * Answers from before the consent screen existed are shown it once, on the
 * next open (#471, owner). Agreeing records the date; Not now clears the
 * answers, so either way this stops being true and it is not shown again.
 * Closing it without a choice defers it to the next launch, or Close would
 * land straight back on it.
 *
 * Rendered by the root layout, beside the navigator, so it holds whichever
 * screen the app was opened on: a link to a product or to the Skin profile
 * editor would otherwise score and edit an unconsented profile. Declarative,
 * like the onboarding gate in the tabs: a screen that renders a `Redirect`
 * cannot fire before the navigator has mounted.
 */
export function ConsentGate() {
  const profile = useAppStore((s) => s.profile);
  const consentAt = useAppStore((s) => s.profileConsentAt);
  const deferred = useAppStore((s) => s.consentDeferred);
  return needsConsent(profile, consentAt) && !deferred ? <Redirect href={CONSENT_LAUNCH_HREF} /> : null;
}
