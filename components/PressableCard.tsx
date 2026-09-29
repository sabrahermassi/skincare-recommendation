import { useState, type ReactNode } from "react";
import { Animated, Platform, type StyleProp, type ViewStyle } from "react-native";

import { CARD_SHADOW } from "@/lib/tokens";

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

/**
 * A card lifted off the page by a shade under its bottom edge. The shade sits on
 * this outer view and the card's own layout, border and clipping on what goes
 * inside it: a view that clips (or rounds) its contents loses its own shade on
 * iOS. Give it `scale` to make it sink with a press.
 */
export function LiftedCard({
  radius = 16,
  backgroundColor,
  scale,
  style,
  children,
}: {
  radius?: number;
  backgroundColor: string;
  scale?: Animated.Value;
  /** Margins and the like, on the shaded outer view. */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <Animated.View
      style={[{ borderRadius: radius, backgroundColor, ...CARD_SHADOW }, scale ? { transform: [{ scale }] } : null, style]}
    >
      {children}
    </Animated.View>
  );
}
