import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

/**
 * Whether this phone can draw Apple's Liquid Glass (iOS 26 and later, and the
 * API actually present: some iOS 26 betas lack it). Answered once. Anywhere
 * else, and under Jest, `Glass` draws the blur it always has.
 */
export const hasLiquidGlass = (() => {
  if (Platform.OS !== "ios") return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
})();

/**
 * The one piece of glass in the app (owner, 7 October 2026: the see-through
 * look, in Apple's own Liquid Glass wherever it can be). Use it for the
 * navigation and control layer that floats over content — a fixed header, the
 * tab bar, a round button — and never for the content itself: cards and reading
 * text stay flat.
 *
 * On iOS 26 and later it is the real thing (`UIGlassEffect`, through
 * expo-glass-effect): it refracts what is behind it and lights its own rim.
 * Elsewhere it is the frosted blur the app had, so nothing about the layout
 * changes. The two never draw together.
 *
 * `fill` is the frosting's colour in the fallback; `tint` lets a little of a
 * colour into the real glass (leave it off for clear glass). `interactive`
 * gives the real glass its press response. Light always: the app is light only.
 * Sized by `style`, which usually fills its parent.
 */
export function Glass({
  style,
  fill,
  blur = 12,
  tint,
  interactive = false,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  /** Fallback only: the frosting over the blur. */
  fill?: string;
  /** Fallback only: how strongly the blur is applied, 1-100. */
  blur?: number;
  /** Liquid Glass only: a colour let into the glass. */
  tint?: string;
  interactive?: boolean;
  children?: ReactNode;
}) {
  if (hasLiquidGlass) {
    return (
      <GlassView glassEffectStyle="regular" colorScheme="light" tintColor={tint} isInteractive={interactive} style={style}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[style, { overflow: "hidden" }]}>
      {/* "light", never "default": the default follows the phone's appearance. */}
      <BlurView intensity={blur} tint="light" style={StyleSheet.absoluteFill} />
      {fill ? <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} /> : null}
      {children}
    </View>
  );
}
