import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";
import type { Ingredient } from "@/data/types";
import { positionWeightLabel } from "@/lib/matching";
import { poreVerdict, type CloggerHit } from "@/lib/pore-clogging";

/**
 * The pore-clogging ingredients, named — step 4 of the product screen.
 *
 * It renders *only* when there is something to name. The verdict itself
 * ("Elevated", "Low", "Unknown") is already stated by the risk card directly
 * above this, and saying it twice on one screen is what made the screen hard
 * to read in the first place. This section answers the follow-up question —
 * "which ones?" — and nothing else.
 *
 * Position is the part the web checkers leave out. INCI order is regulated
 * descending-concentration data, so coconut oil at #4 of 31 and the same name
 * at #29 are different findings, and the label says which.
 */

function positionLine(hit: CloggerHit): string {
  return `#${hit.position} of ${hit.total} · ${positionWeightLabel(hit.position - 1)}`;
}

export function PoreCloggingList({
  ingredients,
  onPress,
}: {
  ingredients: Ingredient[];
  /** Opens the full list filtered to these. Omit to render inert. */
  onPress?: () => void;
}) {
  const verdict = poreVerdict(ingredients);
  if (verdict.kind !== "hits") return null;

  const { hits, warned } = verdict;
  const contested = hits.length - warned.length;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={{ marginHorizontal: 24, marginTop: 20, gap: 12 }}
      className="active:opacity-70"
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text className="flex-1 text-[10.5px] font-bold uppercase tracking-[0.9px] text-ink-faint">
          Pore-clogging ingredients
        </Text>
        {onPress ? (
          <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
            <Path
              d="m9 5 7 7-7 7"
              stroke="#BDB6C2"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}
      </View>

      <View className="overflow-hidden rounded-card border border-hairline bg-surface">
        {hits.map((hit, index) => (
          <View
            key={`${hit.name}-${hit.position}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}
            className={index === hits.length - 1 ? "" : "border-b border-hairline-soft"}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: hit.confidence === "contested" ? "#C3BDC7" : "#DE7E93",
              }}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text className="text-[13.5px] font-medium capitalize leading-[18px] text-ink">
                {hit.name}
              </Text>
              <Text className="text-[11px] text-ink-muted">{positionLine(hit)}</Text>
            </View>
            {hit.confidence === "contested" ? (
              <Text className="text-[10px] uppercase tracking-[0.5px] text-ink-faint">
                Disputed
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      {contested > 0 && warned.length > 0 ? (
        <Text className="text-[11px] leading-[15px] text-ink-muted">
          {contested} of these {contested === 1 ? "is" : "are"} disputed - some
          published lists flag {contested === 1 ? "it" : "them"}, others don&apos;t.
        </Text>
      ) : null}
    </Pressable>
  );
}
