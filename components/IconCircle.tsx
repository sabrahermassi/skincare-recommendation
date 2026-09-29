import type { ReactNode } from "react";
import { Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";

import { ICON_SHADOW, INK, SURFACE } from "@/lib/tokens";

/** The circle's size (v7): the nav bar's back, close, heart, share and star. */
export const ICON_CIRCLE = 40;

/**
 * A 40pt white circle with a soft shade and an ink icon in it (v7): back,
 * close, heart, share and star in a nav bar or on a sheet. Hearts and stars
 * inside list rows stay plain, without a circle.
 */
export function IconCircle({
  onPress,
  accessibilityLabel,
  accessibilityState,
  children,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityState?: { selected?: boolean };
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      hitSlop={4}
      style={{ width: ICON_CIRCLE, height: ICON_CIRCLE, borderRadius: ICON_CIRCLE / 2, backgroundColor: SURFACE, alignItems: "center", justifyContent: "center", ...ICON_SHADOW }}
      className="active:opacity-80"
    >
      {children}
    </Pressable>
  );
}

/** The back arrow in its circle: an arrow only, never a word beside it (v7). */
export function BackChevron({ color = INK }: { color?: string }) {
  return (
    <Svg width={10} height={17} viewBox="0 0 12 20" fill="none" style={{ marginRight: 2 }}>
      <Path d="M10 2 2 10l8 8" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The close cross in its circle. */
export function CloseCross({ color = INK }: { color?: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6 6 18M6 6l12 12" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}
