import { useState } from "react";
import { Animated, Platform } from "react-native";

/** How far a card sinks when pressed. */
const PRESSED_SCALE = 0.97;

/**
 * The sink-and-spring-back of a pressed card. Returns the animated scale and the
 * two press handlers to put on whatever Pressable sits inside the card, for
 * cards whose Pressable is not the card itself (a Link, a row with a sibling
 * button).
 */
export function usePressScale() {
  const [scale] = useState(() => new Animated.Value(1));
  const to = (value: number) =>
    Animated.spring(scale, { toValue: value, friction: 6, tension: 220, useNativeDriver: Platform.OS !== "web" }).start();
  return [scale, { onPressIn: () => to(PRESSED_SCALE), onPressOut: () => to(1) }] as const;
}
