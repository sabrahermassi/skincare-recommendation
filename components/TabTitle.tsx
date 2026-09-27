import { Text } from "@/components/Text";
import { INK } from "@/lib/tokens";

/**
 * The title at the top of a tab (Saved, Skincare School, Profile): on the left,
 * in the headline serif, the same size on every tab (owner's reference). 30pt
 * is that reference's size, measured off its screenshot (a 21pt cap height, and
 * Playfair's caps are 0.71 of its size); no type step is that large.
 */
const TAB_TITLE_SIZE = 30;

export function TabTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: TAB_TITLE_SIZE, color: INK }}>
      {children}
    </Text>
  );
}
