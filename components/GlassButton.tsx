import { Ionicons } from "@expo/vector-icons";
import { Button, Host } from "@expo/ui/swift-ui";
import { buttonBorderShape, buttonStyle, controlSize, labelStyle } from "@expo/ui/swift-ui/modifiers";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import type { ComponentProps } from "react";
import { Platform, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

import { CANVAS, INK, TOUCH_TARGET, withAlpha } from "@/lib/tokens";

/**
 * A round glass button: the X that closes something, the scanner's "i" and
 * torch. Every X in the app is this button (owner, after OnSkin's scanner).
 *
 * On iOS 26 and later it is Apple's own SwiftUI button — `.buttonStyle(.glass)`
 * with a circle border shape and an SF Symbol — the same control the system and
 * Apple's apps use, not a lookalike. Elsewhere (older iOS, Android, web) it falls
 * back to a quiet translucent disc of the same size with a matching icon, so the
 * layout never changes.
 *
 * `onDark` sits over the camera (dark glass, light icon); the default sits on
 * the cream screens (light glass, ink icon).
 */
export function GlassButton({
  symbol,
  icon,
  accessibilityLabel,
  onPress,
  onDark = false,
  small = false,
  style,
}: {
  /** The SF Symbol drawn on iOS, e.g. "xmark". */
  symbol: SFSymbol;
  /** The matching icon for the fallback disc. */
  icon: ComponentProps<typeof Ionicons>["name"];
  accessibilityLabel: string;
  onPress?: () => void;
  onDark?: boolean;
  /** The small one, inside a card or a field. */
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const box = small ? SMALL_BOX : TOUCH_TARGET + 4;
  if (Platform.OS === "ios" && isLiquidGlassAvailable()) {
    return (
      // A fixed box, the glass centred in it, so buttons in a row line up
      // whatever the symbol's own size (info.circle draws a little larger).
      <Host colorScheme={onDark ? "dark" : "light"} style={[{ width: box, height: box, alignItems: "center", justifyContent: "center" }, style]}>
        <Button
          label={accessibilityLabel}
          systemImage={symbol}
          onPress={onPress}
          modifiers={[
            buttonStyle("glass"),
            buttonBorderShape("circle"),
            labelStyle("iconOnly"),
            controlSize(small ? "small" : "large"),
          ]}
        />
      </Host>
    );
  }

  const size = small ? GLASS_BUTTON_SMALL : TOUCH_TARGET;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // A small disc still gets a whole touch target around it.
      hitSlop={Math.max(0, (TOUCH_TARGET - size) / 2)}
      style={style}
      className="active:opacity-80"
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: onDark ? withAlpha(CANVAS, 0.22) : withAlpha(INK, 0.07),
        }}
      >
        <Ionicons name={icon} size={Math.round(size * 0.5)} color={onDark ? CANVAS : INK} />
      </View>
    </Pressable>
  );
}

/** The small fallback disc, inside a card or a field. */
const GLASS_BUTTON_SMALL = 28;
/** The small SwiftUI button's box: its glass at `controlSize("small")` fits in it. */
const SMALL_BOX = 32;
