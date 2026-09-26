import { useMemo } from "react";
import { Pressable, View } from "react-native";

import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { Text, useIconScale } from "@/components/Text";
import type { Ingredient } from "@/data/types";
import { ingredientCheck, ingredientCheckLine, ingredientCheckTone } from "@/lib/ingredient-labels";
import { RUNG_META } from "@/lib/matching";
import { BORDER_INACTIVE, FONT_SCALE, INK, MUTED, SURFACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";

/**
 * The Ingredient check (#345): one line at the top of every result, the same
 * for everyone who scans the product, profile or not. The words carry the
 * state; the dot only echoes them. Tapping it opens the ingredient list,
 * flagged rows first, when there is one to open.
 */
export function IngredientCheck({ ingredients, onPress }: { ingredients: Ingredient[]; onPress?: () => void }) {
  const check = useMemo(() => ingredientCheck(ingredients), [ingredients]);
  const line = ingredientCheckLine(check);
  // Held at the ordinary ceiling, like the product's header (#334): on a
  // reading screen it sits above the verdict, and grown with it to the
  // largest size it pushed the verdict off the first screen. The dot and
  // chevron grow with the words, as far as they do.
  const icon = Math.min(useIconScale(TYPE.label), FONT_SCALE.ui);

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
      <View style={{ width: 9 * icon, height: 9 * icon }} className={`rounded-full ${RUNG_META[ingredientCheckTone(check)].dot}`} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text maxFontSizeMultiplier={FONT_SCALE.ui} style={{ fontSize: TYPE.caption, color: MUTED }}>
          Ingredient check
        </Text>
        <Text maxFontSizeMultiplier={FONT_SCALE.ui} style={{ fontSize: TYPE.label, lineHeight: 19, fontWeight: "600", color: INK }}>
          {line}
        </Text>
      </View>
      {onPress ? <ArrowIcon size={16 * icon} color={INK} /> : null}
    </Pressable>
  );
}
