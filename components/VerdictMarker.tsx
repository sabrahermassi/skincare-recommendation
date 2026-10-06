import { View } from "react-native";

import { Text } from "@/components/Text";
import { LABEL_META, type IngredientLabel } from "@/lib/ingredient-labels";
import { VERDICT, VERDICT_NEUTRAL } from "@/lib/tokens";

// v9 (read off the hand-off): an 8pt dot with a 4pt soft halo round it.
const DOT = 8;
const HALO = 4;

/** A verdict's colours: green, ochre, red, or grey for unknown and for a row the list gives no word. */
export function verdictTone(label: IngredientLabel | null) {
  if (label === "good") return VERDICT.high;
  if (label === "watch") return VERDICT.medium;
  if (label === "avoid") return VERDICT.low;
  return VERDICT_NEUTRAL;
}

/**
 * The dot on its own: a solid 8pt dot inside a 4pt halo, drawn as two circles
 * rather than a spread shadow. Its box is the dot plus 2pt each side, as in
 * the hand-off, so the halo spills 2pt past it.
 */
export function VerdictDot({ colour, halo }: { colour: string; halo: string }) {
  const size = DOT + 2 * HALO;
  return (
    <View style={{ width: size, height: size, marginHorizontal: -(HALO - 2), borderRadius: size / 2, backgroundColor: halo, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colour }} />
    </View>
  );
}

/**
 * An ingredient's verdict under its name (v9), everywhere one is shown: the
 * dot with its halo, then the word in the verdict's text colour. There are no
 * Good / Watch / Avoid pills.
 */
export function VerdictMarker({ label, text }: { label: IngredientLabel; /** The word to show in place of the label's own (the EU safety notice's "Check label", #404). */ text?: string }) {
  const tone = verdictTone(label);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <VerdictDot colour={tone.solid} halo={tone.halo} />
      <Text style={{ fontSize: 15, color: tone.deep }}>{text ?? LABEL_META[label].label}</Text>
    </View>
  );
}
