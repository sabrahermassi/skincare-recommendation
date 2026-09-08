import { View } from "react-native";

import { Text } from "@/components/Text";

import { matchTone } from "@/lib/matching";
import { SURFACE, VERDICT, withAlpha } from "@/lib/tokens";

/**
 * A match score is a "should I buy this" signal, so it always carries a word
 * alongside the colour, never colour alone.
 *
 * Two registers. `solid` states the number itself on the verdict's full
 * colour — the standalone badge. `soft` is the tinted pill a list row uses,
 * where the number is already set underneath it in full-contrast ink and a
 * solid block in every row would read as an alarm.
 *
 * NOTE: nothing imports this today. `ProductRow` and the Saved screen draw
 * their own badge inline because each pairs it with a leading colour bar the
 * badge knows nothing about. It is kept, and kept reading from `VERDICT`
 * rather than its own copy of the ramp, so it cannot drift out of step with
 * the screens that do the same job.
 */
export function MatchBadge({
  score,
  variant = "solid",
}: {
  score: number | null;
  variant?: "solid" | "soft";
}) {
  if (score === null) return null;

  const verdict = VERDICT[matchTone(score)];

  if (variant === "soft") {
    return (
      <View
        style={{
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 4.5,
          backgroundColor: verdict.tint,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "600", color: verdict.deep }}>
          {verdict.label}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: verdict.solid,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: SURFACE }}>{score}%</Text>
      <Text style={{ fontSize: 11, fontWeight: "500", color: withAlpha(SURFACE, 0.9) }}>
        · {verdict.label}
      </Text>
    </View>
  );
}
