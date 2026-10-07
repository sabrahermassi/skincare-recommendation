import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Whether the phone asks for less transparency (iOS: Settings › Accessibility ›
 * Display & Text Size › Reduce Transparency). The real Liquid Glass adapts to
 * it on its own; the frosted blur `Glass` falls back to does not, so it reads
 * this and draws a solid surface instead.
 */
export function useReduceTransparency(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((enabled) => {
        if (live) setReduced(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduced);
    return () => {
      live = false;
      subscription?.remove();
    };
  }, []);
  return reduced;
}
