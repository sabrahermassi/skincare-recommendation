import { Text, View } from "react-native";

import type { Ingredient } from "@/data/types";
import { comedogenicLabel } from "@/lib/format";
import { SafetyPill } from "./SafetyPill";

export function IngredientRow({ ingredient }: { ingredient: Ingredient }) {
  const flagged = ingredient.comedogenic >= 3 || ingredient.safety !== "safe";

  return (
    <View
      className={`border-b border-slate-100 px-4 py-3 ${
        flagged ? "bg-amber-50/60" : "bg-white"
      }`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-sm font-medium text-slate-900">
          {ingredient.name}
        </Text>
        <SafetyPill level={ingredient.safety} />
      </View>

      <Text
        className={`mt-1 text-xs ${
          ingredient.comedogenic >= 3 ? "text-rose-700" : "text-slate-500"
        }`}
      >
        {comedogenicLabel(ingredient.comedogenic)}
      </Text>

      {ingredient.note ? (
        <Text className="mt-1 text-xs text-slate-500">{ingredient.note}</Text>
      ) : null}
    </View>
  );
}
