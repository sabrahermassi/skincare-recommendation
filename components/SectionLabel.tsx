import { Text } from "@/components/Text";
import { MUTED, SPACE, TYPE } from "@/lib/tokens";

/**
 * A group's small caps label above a card (v7: "WHAT THE NUMBERS MEAN",
 * "GOOD TO KNOW"): 13pt semibold, spaced capitals, in the secondary text
 * colour. The first one on a page sits a section's gap below the title; each
 * later one a bigger gap below the card before it.
 */
export function SectionLabel({ title, first = false }: { title: string; first?: boolean }) {
  return (
    <Text
      accessibilityRole="header"
      style={{
        paddingTop: first ? SPACE.section : 32,
        paddingBottom: SPACE.block,
        paddingHorizontal: 4,
        fontSize: TYPE.caption,
        fontWeight: "600",
        letterSpacing: 0.8,
        textTransform: "uppercase",
        color: MUTED,
      }}
    >
      {title}
    </Text>
  );
}
