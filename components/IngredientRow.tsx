import { View } from "react-native";

import { Text } from "@/components/Text";

import type { Ingredient } from "@/data/types";
import { comedogenicLabel } from "@/lib/format";
import { COMEDOGENIC_FLAG_THRESHOLD, isFlagged } from "@/lib/safety";
import { SafetyPill } from "./SafetyPill";

export function IngredientRow({ ingredient }: { ingredient: Ingredient }) {
  const flagged = isFlagged(ingredient);

  /**
   * `verified === false` means the name was parsed off a crowdsourced label
   * and never matched to CosIng or MFDS. Those entries are frequently
   * OCR-mangled — the live data contains fused rows like "Ulmus Davidiana Root
   * raria Lobata Root" — so the row states plainly that we don't recognise it
   * and withholds the safety pill and the pore rating entirely.
   *
   * Showing "Safe · Won't clog pores" against a name we cannot identify would
   * be inventing a reassurance, which is the worst failure this screen has.
   * `undefined` (the hand-written sample catalogue) counts as trusted.
   */
  const unverified = ingredient.verified === false;

  return (
    <View
      className={`border-b border-hairline px-4 py-3 ${
        flagged && !unverified ? "bg-tint-peach/40" : "bg-surface"
      }`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text
          className={`flex-1 text-sm font-medium ${
            unverified ? "text-ink-muted" : "text-ink"
          }`}
        >
          {ingredient.name}
        </Text>
        {!unverified && <SafetyPill level={ingredient.safety} />}
      </View>

      {unverified ? (
        <Text className="mt-1 text-xs text-ink-faint">
          Not recognised — we can&apos;t assess this one
        </Text>
      ) : (
        <>
          <Text
            className={`mt-1 text-xs ${
              ingredient.comedogenic >= COMEDOGENIC_FLAG_THRESHOLD
                ? "text-status-watch"
                : "text-ink-muted"
            }`}
          >
            {comedogenicLabel(ingredient.comedogenic)}
          </Text>

          {ingredient.note ? (
            <Text className="mt-1 text-xs text-ink-muted">{ingredient.note}</Text>
          ) : null}
        </>
      )}
    </View>
  );
}
