import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { PoreCloggingList } from "@/components/PoreCloggingList";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { resolveIngredientNames } from "@/data/api";
import type { Ingredient } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { isPoreClogging } from "@/lib/pore-clogging";
import { isVerified } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

/**
 * The result of pasting an ingredient list — the screen that replaces
 * "copy from INCIDecoder, paste into a pore-clogging checker".
 *
 * It deliberately does not pretend to be a product. There is no barcode, no
 * brand, no match score: a pasted list is a formula and nothing else, and
 * inventing a product record around it would put a fabricated row in the
 * catalogue. What it does give is the answer the paste was for.
 *
 * Pore-clogging is computed on the device against the curated table, so it
 * works with no network at all. The dictionary lookup that fills in regulatory
 * status and declared functions is a bonus on top — when it fails, the screen
 * still answers the question it was opened to answer.
 */
export default function CheckScreen() {
  const names = useAppStore((s) => s.pastedIngredients);
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

  if (ingredients === null) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (ingredients.length === 0) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title="Ingredient check" />
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="text-center text-[13px] leading-[19px] text-ink-muted">
            Nothing to check - paste an ingredient list on the Scan tab and it
            will show up here.
          </Text>
          <PrimaryButton label="Back to scanning" onPress={() => router.replace("/scan")} />
        </View>
      </View>
    );
  }

  const recognised = ingredients.filter(isVerified).length;

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Ingredient check" />

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <Text className="px-6 pt-4 text-[11.5px] text-ink-muted">
          {ingredients.length} ingredient{ingredients.length === 1 ? "" : "s"} pasted ·{" "}
          {recognised} recognised
        </Text>

        <PoreCloggingList ingredients={ingredients} />

        <Text className="px-6 pb-2 pt-7 text-[10.5px] font-bold uppercase tracking-[0.9px] text-ink-faint">
          The full list
        </Text>

        <View className="border-t border-hairline-soft">
          {ingredients.map((ingredient, index) => (
            <PastedRow
              key={`${ingredient.name}-${index}`}
              ingredient={ingredient}
              position={index + 1}
            />
          ))}
        </View>

        <Text className="px-6 pt-6 text-[11px] leading-[16px] text-ink-faint">
          Ingredients are listed in order of concentration, so what is near the
          top matters more than what is near the bottom. A pasted list is not
          saved to your shelf - it has no product attached to it.
        </Text>
      </ScrollView>
    </View>
  );
}

function PastedRow({ ingredient, position }: { ingredient: Ingredient; position: number }) {
  const clogs = isPoreClogging(ingredient);
  const unknown = !isVerified(ingredient);

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/ingredient/[inci]", params: { inci: ingredient.name } })
      }
      style={{ gap: 11 }}
      className="flex-row items-center border-b border-hairline-soft bg-surface px-6 py-3 active:bg-canvas"
    >
      <Text style={{ width: 22 }} className="text-[11px] tabular-nums text-ink-faint">
        {position}
      </Text>

      <View className="flex-1 gap-0.5">
        <Text className="text-[13.5px] font-medium capitalize leading-[18px] text-ink">
          {ingredient.name}
        </Text>
        {unknown ? (
          <Text className="text-[11px] text-ink-faint">
            Not in our dictionary - we can&apos;t assess this one
          </Text>
        ) : null}
      </View>

      {clogs ? (
        <View
          style={{ backgroundColor: "#FBE2E7", paddingHorizontal: 7, paddingVertical: 3 }}
          className="rounded-full"
        >
          <Text style={{ color: "#A4526A", fontSize: 9.5 }} className="font-bold uppercase">
            Clogging
          </Text>
        </View>
      ) : null}

      <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
        <Path
          d="m9 5 7 7-7 7"
          stroke="#BDB6C2"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}
