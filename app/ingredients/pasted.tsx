import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { IngredientTabsList } from "@/components/IngredientTabsList";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { resolveIngredientNames } from "@/data/api";
import type { Ingredient } from "@/data/types";
import { matchIngredients } from "@/lib/matching";
import { isVerified } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";
import { CANVAS, INK, MUTED } from "@/lib/tokens";

// Manassa system (design/DESIGN_SYSTEM.md).

/**
 * The result of pasting an ingredient list — the exact same screen a scanned
 * product's ingredient list uses (`app/ingredients/[id].tsx`, same header,
 * same `IngredientTabsList`), minus the copy button: a pasted list has no
 * product record behind it, so there's nothing to attribute a copy to.
 *
 * This used to carry a genuine duplicate top bar: this route had no entry in
 * `app/_layout.tsx`'s Stack, so on top of this screen's own `ScreenHeader` it
 * also got React Navigation's default native header, auto-titled from the
 * route itself ("ingredients/pasted") — two headers stacked, one of them
 * showing raw file-path text. Fixed by registering the route with
 * `headerShown: false` there, the same as every other pushed screen.
 *
 * There is no product record behind a pasted list — no barcode, no brand,
 * no fetch date — so `matchIngredients` (`lib/matching.ts`) scores the raw
 * names directly instead of going through a fabricated product, and the
 * meta line says "pasted" rather than showing a label-read date.
 */
export default function PastedIngredients() {
  const names = useAppStore((s) => s.pastedIngredients);
  const profile = useAppStore((s) => s.profile);
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);

  useEffect(() => {
    if (!names || names.length === 0) {
      setIngredients([]);
      return;
    }
    let cancelled = false;
    resolveIngredientNames(names).then((resolved) => {
      if (!cancelled) setIngredients(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [names]);

  const match = useMemo(
    () => (ingredients ? matchIngredients(ingredients, profile) : null),
    [ingredients, profile]
  );

  if (ingredients === null || !match) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
        <ActivityIndicator color={INK} />
      </View>
    );
  }

  if (ingredients.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: CANVAS }}>
        <ScreenHeader title="Ingredients" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 }}>
          <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>
            Nothing to check - paste an ingredient list on the Scan tab and it
            will show up here.
          </Text>
          <PrimaryButton
            tone="cta"
            size={52}
            label="Back to scanning"
            onPress={() => router.replace("/")}
          />
        </View>
      </View>
    );
  }

  const total = ingredients.length;
  const recognised = ingredients.filter(isVerified).length;

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader title="Ingredients" />

      <IngredientTabsList
        ingredients={ingredients}
        match={match}
        metaLine={`${total} ingredient${total === 1 ? "" : "s"} pasted · ${recognised} recognised`}
        onIngredientPress={(ingredient) =>
          // No product param: this list has no product behind it, and
          // `app/ingredient/[inci].tsx` already handles that case (it's
          // exactly how the old flat paste-check screen linked out too).
          router.push({ pathname: "/ingredient/[inci]", params: { inci: ingredient.name } })
        }
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          paddingHorizontal: 24,
          paddingBottom: 32,
          paddingTop: 16,
          backgroundColor: CANVAS,
        }}
      >
        <Text style={{ fontSize: 10.5, color: MUTED, textAlign: "center" }}>
          Ingredients are listed in order of concentration. A pasted list is
          not saved to your shelf - it has no product attached to it.
        </Text>
      </View>
    </View>
  );
}
