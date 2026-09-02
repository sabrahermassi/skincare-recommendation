import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { Text } from "@/components/Text";
import type { ProductWithIngredients } from "@/data/types";
import type { MatchResult } from "@/lib/matching";
import { COMEDOGENIC_FLAG_THRESHOLD, isVerified } from "@/lib/safety";

/**
 * The two risks people actually ask about, side by side, both computed from
 * the formula rather than quoted from a hazard database.
 *
 * The mockup only ever draws the reassuring state, so an earlier version was
 * hard-coded to it — a formula with three restricted entries announced
 * "Elevated" in the same calm green as "Low". Each verdict carries its own
 * tone now, on the same four-rung ramp as the ingredient list.
 */
const RISK_TONE = {
  good: { box: "border-panel-risk-line bg-panel-risk", ink: "text-level-good-ink" },
  watch: { box: "border-level-watch-tint bg-level-watch-tint", ink: "text-level-watch-ink" },
  avoid: { box: "border-level-avoid-tint bg-level-avoid-tint", ink: "text-level-avoid-ink" },
  neutral: { box: "border-hairline bg-level-neutral-tint", ink: "text-level-neutral-ink" },
} as const;

type Risk = { level: string; note: string; tone: keyof typeof RISK_TONE };

export function RiskCards({
  product,
  match,
}: {
  product: ProductWithIngredients;
  match: MatchResult;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 24, paddingTop: 14 }}>
      <RiskCard
        title="Irritation risk"
        {...irritationRisk(product, match)}
        icon={
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 3.2 5 6v5.6c0 4.3 2.9 7.6 7 9.2 4.1-1.6 7-4.9 7-9.2V6l-7-2.8Z"
              stroke="#6D9A7E"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        }
      />
      <RiskCard
        title="Pore-clogging risk"
        {...poreRisk(product, match)}
        icon={
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Circle cx={8} cy={8} r={1.4} stroke="#6D9A7E" strokeWidth={1.7} />
            <Circle cx={15.6} cy={9.4} r={1.4} stroke="#6D9A7E" strokeWidth={1.7} />
            <Circle cx={10} cy={15.4} r={1.4} stroke="#6D9A7E" strokeWidth={1.7} />
            <Circle cx={16.4} cy={16} r={1.4} stroke="#6D9A7E" strokeWidth={1.7} />
          </Svg>
        }
      />
    </View>
  );
}

function RiskCard({
  title,
  icon,
  level,
  note,
  tone,
}: Risk & { title: string; icon: React.ReactNode }) {
  const style = RISK_TONE[tone];
  return (
    <View
      // Everything left-aligned on one axis and vertically centred as a block.
      // The title used to be a two-line string with a hard break in it, which
      // put the icon beside line one and the verdict adrift below both.
      style={{ flex: 1, gap: 8, paddingHorizontal: 15, paddingVertical: 15 }}
      className={`justify-center rounded-control border ${style.box}`}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {icon}
        <Text
          className="text-[11.5px] leading-[15px] text-[#4C574F]"
          style={{ flex: 1 }}
          numberOfLines={2}
        >
          {title}
        </Text>
      </View>
      <View style={{ gap: 3 }}>
        <Text className={`font-display text-[21px] leading-[24px] ${style.ink}`}>{level}</Text>
        <Text className="text-[10.5px] leading-[14px] text-ink-muted" numberOfLines={2}>
          {note}
        </Text>
      </View>
    </View>
  );
}

/**
 * Irritation risk, from the EU regulatory status of what is actually in the
 * bottle plus anything contraindicated for this profile. Not a hazard score —
 * a count of restricted entries, said in words.
 */
function irritationRisk(product: ProductWithIngredients, match: MatchResult): Risk {
  const restricted = product.ingredients.filter(
    (i) => isVerified(i) && i.safety !== "safe"
  ).length;
  const personal = match.warnings.length;

  if (product.ingredients.length === 0) {
    return { level: "Unknown", note: "Label not read yet", tone: "neutral" };
  }
  if (personal > 0) {
    return { level: "Elevated", note: `${personal} flagged for your skin`, tone: "avoid" };
  }
  if (restricted === 0) return { level: "Low", note: "Nothing restricted", tone: "good" };
  if (restricted <= 2) {
    return { level: "Moderate", note: `${restricted} restricted entries`, tone: "watch" };
  }
  return { level: "Elevated", note: `${restricted} restricted entries`, tone: "avoid" };
}

/**
 * Pore-clogging risk. CosIng rates no ingredient for this — `comedogenic` is
 * null for every real row — so where the rating is absent this falls back to
 * the rule table's own pore-clogging category, which is where that judgement
 * actually lives.
 */
function poreRisk(product: ProductWithIngredients, match: MatchResult): Risk {
  if (product.ingredients.length === 0) {
    return { level: "Unknown", note: "Label not read yet", tone: "neutral" };
  }

  const rated = product.ingredients.filter((i) => isVerified(i) && i.comedogenic > 0);
  const worst = Math.max(0, ...rated.map((i) => i.comedogenic));
  const fromRules = match.factors.find((f) => f.category === "pore-clogging" && f.delta < 0);

  if (worst >= COMEDOGENIC_FLAG_THRESHOLD) {
    return { level: "Elevated", note: `Rated ${worst}/5 at worst`, tone: "avoid" };
  }
  if (fromRules) {
    return {
      level: "Moderate",
      note: fromRules.ingredients[0] ?? "One ingredient",
      tone: "watch",
    };
  }
  if (worst > 0) return { level: "Low", note: `Rated ${worst}/5 at worst`, tone: "good" };
  return { level: "Low", note: "Nothing flagged", tone: "good" };
}
