import { Text } from "@/components/Text";
import { MUTED, SPACE, TRACKING, TYPE } from "@/lib/tokens";

/**
 * A group's small caps label above a card ("WHAT THE NUMBERS MEAN", "GOOD TO
 * KNOW"): 13pt semibold, spaced capitals, in the secondary text colour. v9
 * (read off the hand-off): a section's gap above it every time, a line's gap
 * below. `first` no longer changes anything; it stays so callers still read
 * as they did.
 */
export function SectionLabel({ title }: { title: string; first?: boolean }) {
  return (
    <Text
      accessibilityRole="header"
      style={{
        paddingTop: SPACE.section,
        paddingBottom: SPACE.text,
        paddingHorizontal: SPACE.tight,
        fontSize: TYPE.caption,
        fontWeight: "600",
        letterSpacing: TRACKING.caption,
        textTransform: "uppercase",
        color: MUTED,
      }}
    >
      {title}
    </Text>
  );
}
