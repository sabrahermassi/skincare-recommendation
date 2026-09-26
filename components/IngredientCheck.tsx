import { useMemo } from "react";
import { Pressable, View } from "react-native";

import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { Text } from "@/components/Text";
import type { Ingredient } from "@/data/types";
import { ingredientCheck, ingredientCheckLine, ingredientCheckTone } from "@/lib/ingredient-labels";
import { RUNG_META } from "@/lib/matching";
import { BORDER_INACTIVE, INK, MUTED, SURFACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";

/**
 * The Ingredient check (#345): one line at the top of every result, the same
 * for everyone who scans the product, profile or not. The words carry the
 * state; the dot only echoes them. Tapping it opens the ingredient list,
 * flagged rows first, when there is one to open.
 */
export function IngredientCheck({ ingredients, onPress }: { ingredients: Ingredient[]; onPress?: () => void }) {
  const check = useMemo(() => ingredientCheck(ingredients), [ingredients]);
  const line = ingredientCheckLine(check);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`Ingredient check: ${line}`}
      accessibilityHint={onPress ? "Opens the ingredient list" : undefined}
      style={{
        minHeight: TOUCH_TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: BORDER_INACTIVE,
        backgroundColor: SURFACE,
      }}
      className="rounded-control active:opacity-70"
    >
      <View style={{ width: 9, height: 9 }} className={`rounded-full ${RUNG_META[ingredientCheckTone(check)].dot}`} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: TYPE.caption, color: MUTED }}>Ingredient check</Text>
        <Text style={{ fontSize: TYPE.label, lineHeight: 19, fontWeight: "600", color: INK }}>{line}</Text>
      </View>
      {onPress ? <ArrowIcon size={16} color={INK} /> : null}
    </Pressable>
  );
}
