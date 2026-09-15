import { useEffect } from "react";
import { AccessibilityInfo, Platform, View } from "react-native";

import { Text } from "@/components/Text";

/**
 * Speaks a status change to a screen reader, on all three platforms.
 *
 * This exists because no single API covers them, and the obvious one-liner —
 * `accessibilityLiveRegion` on the element that shows the status — covers
 * exactly one:
 *
 *  - **Android** honours `accessibilityLiveRegion`, on mount and on update.
 *  - **iOS** ignores it entirely. The note on the onboarding toast in
 *    `app/onboarding/index.tsx` records the same discovery from the other
 *    direction: there, being focusable is what got the text to VoiceOver.
 *    The reliable route is the imperative `announceForAccessibility`.
 *  - **react-native-web** maps the prop to `aria-live`, but
 *    `announceForAccessibility` is a literal empty function
 *    (`react-native-web/dist/exports/AccessibilityInfo/index.js`). And
 *    `aria-live` only fires for content that changes *inside* a region the
 *    screen reader is already watching — mounting the region together with
 *    its text, which is what a conditionally-rendered status panel does,
 *    announces nothing at all.
 *
 * So the shape is: a region that is always mounted and only ever changes its
 * text, which serves web and Android, plus the imperative call for iOS. The
 * iOS call is gated on platform rather than fired everywhere, because on
 * Android it would land on top of the live region and say everything twice.
 *
 * Visually hidden by size, deliberately not by `display: none` or
 * `opacity: 0` — either of those takes the node out of the accessibility tree,
 * which is the silence this component exists to fix.
 *
 * Pass the empty string for "nothing to say". Announcing is keyed on the
 * message changing, so the same message twice in a row is spoken once; if a
 * repeat genuinely needs re-announcing, clear it to "" first.
 */
export function ScreenReaderAnnouncer({ message }: { message: string }) {
  useEffect(() => {
    if (message && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message]);

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}
      pointerEvents="none"
    >
      <Text>{message}</Text>
    </View>
  );
}
