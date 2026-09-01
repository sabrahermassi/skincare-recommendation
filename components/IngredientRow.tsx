import { View } from "react-native";

import { Text } from "@/components/Text";

import type { Ingredient } from "@/data/types";
import { comedogenicLabel } from "@/lib/format";
import { COMEDOGENIC_FLAG_THRESHOLD, isFlagged } from "@/lib/safety";
import { SafetyPill } from "./SafetyPill";

export function IngredientRow({ ingredient }: { ingredient: Ingredient }) {
  const flagged = isFlagged(ingredient);

  return (
    <View
      className={`border-b border-hairline px-4 py-3 ${flagged ? "bg-tint-peach/40" : "bg-surface"}`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-sm font-sans-medium text-ink">{ingredient.name}</Text>
        <SafetyPill level={ingredient.safety} />
      </View>

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
    </View>
  );
}
