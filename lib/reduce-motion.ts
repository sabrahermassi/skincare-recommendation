import { useEffect, useRef } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Whether the system asks for reduced motion, kept current while the app is
 * open — as a ref, for animations started from effects and callbacks. False
 * until the first read lands, which is well before anyone can tap anything.
 */
export function useReduceMotionRef() {
  const reduceMotion = useRef(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        reduceMotion.current = enabled;
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      reduceMotion.current = enabled;
    });
    return () => sub.remove();
  }, []);
  return reduceMotion;
}
