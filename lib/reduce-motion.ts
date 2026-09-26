import { AccessibilityInfo } from "react-native";

/**
 * Whether the system asks for reduced motion, read synchronously by an
 * animation at the moment it starts.
 *
 * One value for the whole app, not a per-component ref: a component that
 * starts its animation as it mounts (the scanner's found sheet, remounted on
 * every scan) would otherwise read its own ref before its own check had
 * answered, and always animate (#318 review). This module's check is asked
 * once, when the app first loads it, and the change listener keeps it current.
 */
let reduceMotion = false;

AccessibilityInfo.isReduceMotionEnabled()
  .then((enabled) => {
    reduceMotion = enabled;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
  reduceMotion = enabled;
});

export function reduceMotionNow(): boolean {
  return reduceMotion;
}
