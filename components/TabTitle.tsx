import { Text } from "@/components/Text";
import { DISPLAY_FONT, INK, TYPE, LEADING, TRACKING } from "@/lib/tokens";

/**
 * The title at the top of a tab (Home, Saved, Skincare School, Profile): PT Serif
 * Bold at 30/33, on the left.
 */

export function TabTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.large, lineHeight: LEADING.large, letterSpacing: TRACKING.large, color: INK }}>
      {children}
    </Text>
  );
}
