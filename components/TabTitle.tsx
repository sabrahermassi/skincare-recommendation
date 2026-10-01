import { Text } from "@/components/Text";
import { DISPLAY_FONT, INK, TYPE } from "@/lib/tokens";

/**
 * The title at the top of a tab (Home, Saved, Skincare School, Profile): Instrument
 * Serif 400 at 30/1.15 (v9), on the left.
 */

export function TabTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.large, lineHeight: 34.5, letterSpacing: -0.6, color: INK }}>
      {children}
    </Text>
  );
}
