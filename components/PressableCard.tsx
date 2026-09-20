import { useState, type ReactNode } from "react";
import { Animated, Platform, Pressable, type StyleProp, type ViewStyle } from "react-native";

import { CARD_SHADOW } from "@/lib/tokens";

/** How far a card sinks when pressed. */
const PRESSED_SCALE = 0.97;

/**
 * A card that behaves like a button: lifted off the page by a shade under its
 * bottom edge, and sinking a little while it is pressed. The shade sits on an
 * outer view and the layout on the inner one, because a view that clips (or
 * rounds) its contents loses its own shade on iOS.
 */
export function PressableCard({
  onPress,
  radius = 18,
  backgroundColor,
  style,
  children,
  accessibilityLabel,
}: {
  onPress: () => void;
  radius?: number;
  backgroundColor: string;
  /** Layout of the card's contents. */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  accessibilityLabel: string;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const press = (to: number) =>
    Animated.spring(scale, { toValue: to, friction: 6, tension: 220, useNativeDriver: Platform.OS !== "web" }).start();

  return (
    <Animated.View style={{ borderRadius: radius, backgroundColor, ...CARD_SHADOW, transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => press(PRESSED_SCALE)}
        onPressOut={() => press(1)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[{ borderRadius: radius, overflow: "hidden" }, style]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
