import { View } from "react-native";

import { Text } from "@/components/Text";
import type { MatchReason, ScoreLine, Verdict } from "@/lib/matching";
import { BORDER_INACTIVE, INK, MUTED, TYPE, VERDICT, VERDICT_LABEL, VERDICT_NEUTRAL, toneForVerdict } from "@/lib/tokens";

/**
 * The verdict panel's colours and label — shared by `app/product/[id].tsx`
 * and `app/label-result.tsx` (issue #214), which is why it lives here rather
 * than in either screen. Both screens compute a `MatchResult` and both need
 * the same panel dressing for it; copying this would have let them drift.
 */
export function panelFor(verdict: Verdict): { bg: string; border: string; label: string; ink: string } {
  const tone = toneForVerdict(verdict);
  const colors = tone
    ? { bg: VERDICT[tone].tint, border: VERDICT[tone].solid, ink: VERDICT[tone].deep }
    : { bg: VERDICT_NEUTRAL.tint, border: BORDER_INACTIVE, ink: VERDICT_NEUTRAL.deep };
  return { ...colors, label: VERDICT_LABEL[verdict] };
}

/**
 * One line of "why", naming the ingredient and carrying its own sentence.
 *
 * The sentence comes from `lib/rules.ts`, where every claim the app makes is
 * written next to the rule that makes it — so anything on screen here can be
 * traced to a line of code and argued with.
 */
export function ReasonLine({ reason }: { reason: MatchReason }) {
  return (
    <ExplanationLine
      label={(reason.ingredient ?? "").toLowerCase()}
      detail={reason.reason}
      direction={reason.effect > 0 ? "up" : "down"}
    />
  );
}

/** A verdict-level explanation, rendered before its ingredient-level evidence. */
export function ExplanationLine({ label, detail, direction }: ScoreLine) {
  const positive = direction === "up";
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      {/* Inline style, not a Tailwind className: `bg-tint-mint`/`bg-tint-pink`
          are also the scanner's unrelated "looking/missed" status icon, so
          they can't be repointed at the verdict ramp without recoloring that
          too. This reads the same VERDICT tokens the score ring above uses,
          rather than a third green/pink pair. */}
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          marginTop: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: positive ? VERDICT.high.tint : VERDICT.low.tint,
        }}
      >
        <Text style={{ fontSize: TYPE.caption, fontWeight: "bold", lineHeight: 14, color: INK }}>
          {positive ? "+" : "−"}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontSize: TYPE.label, fontWeight: "600", textTransform: "capitalize", color: INK }}>
          {label}
        </Text>
        <Text style={{ fontSize: TYPE.label, lineHeight: 19, color: MUTED }}>{detail}</Text>
      </View>
    </View>
  );
}
