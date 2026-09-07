import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { CopyIcon } from "@/components/CopyIcon";
import { IngredientTabsList } from "@/components/IngredientTabsList";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { resolveIngredientNames } from "@/data/api";
import type { Ingredient } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { matchIngredients } from "@/lib/matching";
import { isVerified } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

/**
 * The result of pasting an ingredient list, in the same All / Actives /
 * Watch-outs / Pore clogging tabs a scanned product's ingredient screen
 * uses (`app/ingredients/[id].tsx`) — via the shared `IngredientTabsList`.
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
  const [copied, setCopied] = useState(false);

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
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (ingredients.length === 0) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title="Pasted ingredients" />
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="text-center text-[13px] leading-[19px] text-ink-muted">
            Nothing to check - paste an ingredient list on the Scan tab and it
            will show up here.
          </Text>
          <PrimaryButton label="Back to scanning" onPress={() => router.replace("/")} />
        </View>
      </View>
    );
  }

  const total = ingredients.length;
  const recognised = ingredients.filter(isVerified).length;

  async function copyList() {
    if (!ingredients || ingredients.length === 0) return;
    await Clipboard.setStringAsync(ingredients.map((i) => i.name).join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader
        title="Pasted ingredients"
        right={
          total > 0 ? (
            <Pressable
              onPress={copyList}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={copied ? "Ingredient list copied" : "Copy ingredient list"}
            >
              <CopyIcon copied={copied} />
            </Pressable>
          ) : undefined
        }
      />

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
        style={{ backgroundColor: "#F3EFEA" }}
        className="flex-row items-center justify-center gap-2.5 px-6 pb-8 pt-4"
      >
        <Text className="text-[10.5px] text-ink-muted">
          Ingredients are listed in order of concentration. A pasted list is
          not saved to your shelf - it has no product attached to it.
        </Text>
      </View>
    </View>
  );
}
