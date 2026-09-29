import { Text } from "@/components/Text";
import { DISPLAY_FONT, INK, TYPE } from "@/lib/tokens";

/**
 * The title at the top of a tab (Home, Saved, Skincare School, Profile): v7's
 * Large title, Playfair 500 at 30/1.1, on the left.
 */

export function TabTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.large, lineHeight: 33, letterSpacing: -0.6, color: INK }}>
      {children}
    </Text>
  );
}
