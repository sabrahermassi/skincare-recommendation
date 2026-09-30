import { View } from "react-native";

import { Text } from "@/components/Text";
import { LABEL_META, type IngredientLabel } from "@/lib/ingredient-labels";
import { TYPE, VERDICT, VERDICT_NEUTRAL } from "@/lib/tokens";

/** A verdict's ring and word colours (v7): green, orange, red, or brown-grey for unknown. */
function verdictColours(label: IngredientLabel): { solid: string; deep: string; wash: string } {
  if (label === "good") return VERDICT.high;
  if (label === "watch") return VERDICT.medium;
  if (label === "avoid") return VERDICT.low;
  return VERDICT_NEUTRAL;
}

/**
 * An ingredient's verdict under its name (v7), everywhere one is shown: a
 * 12pt ring with a 3pt stroke in the verdict colour, then the word in the
 * verdict's text colour. There are no Good / Watch / Avoid pills any more.
 */
export function VerdictMarker({ label }: { label: IngredientLabel }) {
  const colours = verdictColours(label);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: colours.solid }} />
      <Text style={{ fontSize: TYPE.label, color: colours.deep }}>{LABEL_META[label].label}</Text>
    </View>
  );
}
