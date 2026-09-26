import { Ionicons } from "@expo/vector-icons";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type { ComponentProps } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { CANVAS, INK, TOUCH_TARGET, withAlpha } from "@/lib/tokens";

/**
 * A round button made of iOS glass (Liquid Glass, iOS 26 and later): the X
 * that closes something, the scanner's "i" and torch. Every X in the app is
 * this button, so they all look and feel the same (owner, after OnSkin's
 * scanner).
 *
 * `onDark` sits over the camera, with a light icon; the default sits on the
 * cream screens, with an ink icon. Where Liquid Glass isn't available (older
 * iOS, Android, web) it falls back to a quiet translucent disc of the same
 * size, so the layout never changes.
 */
export function GlassButton({
  icon,
  accessibilityLabel,
  onPress,
  onDark = false,
  size = GLASS_BUTTON_SIZE,
  iconSize,
  hitSlop,
  style,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  accessibilityLabel: string;
  onPress?: () => void;
  onDark?: boolean;
  /** The disc's diameter. The small one sits inside cards and fields. */
  size?: number;
  iconSize?: number;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const glass = isLiquidGlassAvailable();
  const disc: ViewStyle = { width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" };
  const iconColor = onDark ? CANVAS : INK;
  const content = <Ionicons name={icon} size={iconSize ?? Math.round(size * 0.5)} color={iconColor} />;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // A small disc still gets a whole touch target around it.
      hitSlop={hitSlop ?? Math.max(0, (TOUCH_TARGET - size) / 2)}
      style={style}
      className="active:opacity-80"
    >
      {glass ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme={onDark ? "dark" : "light"}
          isInteractive
          style={disc}
        >
          {content}
        </GlassView>
      ) : (
        <View style={[disc, { backgroundColor: onDark ? withAlpha(CANVAS, 0.22) : withAlpha(INK, 0.07) }]}>{content}</View>
      )}
    </Pressable>
  );
}

/** The full-size disc: a whole touch target, like the iOS camera's own buttons. */
const GLASS_BUTTON_SIZE = TOUCH_TARGET;
/** The small disc, inside a card or a field. */
export const GLASS_BUTTON_SMALL = 28;
