import { useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, type StyleProp, type ViewStyle } from "react-native";

import { reduceMotionNow } from "@/lib/reduce-motion";

// v9 (read off the hand-off): a card dips while pressed and springs back past
// its size when let go.
const RELEASE_EASING = Easing.bezier(0.34, 1.56, 0.64, 1);

/**
 * A whole card that is one button (Home's scan card and tiles). Pressing
 * shrinks it to `pressedScale`; letting go springs it back. The action runs
 * at once (owner): it used to wait 260ms for the bounce, and the tap felt
 * slow. The bounce is on the native side, so it carries on while the next
 * screen opens. With Reduce Motion on there is no movement.
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
      onPress={onPress}
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
