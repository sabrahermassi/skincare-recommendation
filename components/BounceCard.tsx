import { useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, type StyleProp, type ViewStyle } from "react-native";

import { reduceMotionNow } from "@/lib/reduce-motion";

// v9 (read off the hand-off): a card dips while pressed and springs back past
// its size when let go; the tap's destination opens once the bounce has had
// time to read.
const RELEASE_EASING = Easing.bezier(0.34, 1.56, 0.64, 1);
const NAVIGATE_AFTER_MS = 260;

/**
 * A whole card that is one button (Home's scan card and tiles). Pressing
 * shrinks it to `pressedScale`; letting go springs it back; the action runs
 * 260ms later so the bounce is seen. With Reduce Motion on there is no
 * movement and the action runs at once.
 */
export function BounceCard({
  onPress,
  pressedScale,
  accessibilityLabel,
  grow,
  style,
  children,
}: {
  onPress: () => void;
  pressedScale: number;
  accessibilityLabel: string;
  /** Takes an equal share of its row (Home's tiles). */
  grow?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const to = (value: number, duration: number, easing: (t: number) => number) =>
    Animated.timing(scale, { toValue: value, duration, easing, useNativeDriver: true }).start();
  return (
    <Pressable
      onPress={() => {
        if (reduceMotionNow()) return onPress();
        setTimeout(onPress, NAVIGATE_AFTER_MS);
      }}
      onPressIn={() => {
        if (!reduceMotionNow()) to(pressedScale, 120, Easing.out(Easing.quad));
      }}
      onPressOut={() => {
        if (!reduceMotionNow()) to(1, 350, RELEASE_EASING);
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={grow ? { flex: 1 } : undefined}
    >
      <Animated.View style={[grow ? { flex: 1 } : null, style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
