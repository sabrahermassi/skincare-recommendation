import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Platform } from "react-native";

/**
 * Makes its icon jump when it is switched on — the heart or the star popping
 * when you like something, up past its size and settling back with a bounce.
 * Nothing happens on the first render (a heart that is already red does not
 * jump when the screen opens) or when it is switched off, and nothing moves at
 * all with Reduce Motion on.
 */
/** Whether a change of `active` should play the pop: only off → on, and never with Reduce Motion. */
export function shouldPop(wasActive: boolean, active: boolean, reduceMotion: boolean): boolean {
  return active && !wasActive && !reduceMotion;
}

export function PopOnToggle({ active, children }: { active: boolean; children: ReactNode }) {
  const [scale] = useState(() => new Animated.Value(1));
  const previous = useRef(active);
  const reduceMotion = useRef(false);
  const useNativeDriver = Platform.OS !== "web";

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

  useEffect(() => {
    const wasActive = previous.current;
    previous.current = active;
    if (!shouldPop(wasActive, active, reduceMotion.current)) return;
    scale.stopAnimation();
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.45, duration: 110, easing: Easing.out(Easing.cubic), useNativeDriver }),
      Animated.spring(scale, { toValue: 1, friction: 3.5, tension: 160, useNativeDriver }),
    ]).start();
  }, [active, scale, useNativeDriver]);

  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}
