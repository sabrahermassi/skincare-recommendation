import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { ProductIllustration } from "@/components/ProductIllustration";
import { ScoreRing } from "@/components/ScoreRing";
import { Text } from "@/components/Text";
import { fetchProduct } from "@/data/api";
import type { Ingredient, ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { relativeTime } from "@/lib/format";
import {
  ingredientTone,
  matchProduct,
  TONE_CLASS,
  TONE_PILL,
  ruleFor,
  type MatchResult,
} from "@/lib/matching";
import { profileSummary } from "@/lib/profile";
import { isVerified } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

/**
 * The full ingredient list — screen 1a of the Skin Match Scanner design.
 *
 * Every row is judged against *this* profile, not in the abstract: the dot and
 * the pill say whether it works for you, which is the whole difference between
 * this and reading the back of the box.
 */

type Tab = "All" | "Actives" | "Watch-outs";

export default function IngredientList() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<ProductWithIngredients | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("All");

  const profile = useAppStore((s) => s.profile);
  const savedProducts = useAppStore((s) => s.savedProducts);
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const saved = savedProducts.some((p) => p.id === id);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProduct(id).then((result) => {
      if (cancelled) return;
      setProduct(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const match = useMemo(
    () => (product ? matchProduct(product, profile) : null),
    [product, profile]
  );

  const counts = useMemo(() => {
    if (!product || !match) return { All: 0, Actives: 0, "Watch-outs": 0 };
    return {
      All: product.ingredients.length,
      Actives: product.ingredients.filter((i) => ruleFor(i) !== undefined).length,
      "Watch-outs": product.ingredients.filter(
        (i) => ingredientTone(i, match) !== "good"
      ).length,
    };
  }, [product, match]);

  if (loading || !match) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (!product) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-8">
        <Text className="font-display text-2xl text-ink">Product not found</Text>
      </View>
    );
  }

  const visible = product.ingredients.filter((i) => {
    if (tab === "Actives") return ruleFor(i) !== undefined;
    if (tab === "Watch-outs") return ingredientTone(i, match) !== "good";
    return true;
  });

  const summary = profileSummary(profile);

  return (
    <View className="flex-1 bg-canvas">
      <Stack.Screen options={{ title: product.brand }} />

      <ScrollView contentContainerClassName="pb-40">
        <View className="flex-row items-start gap-4 px-5 pb-4 pt-3">
          <ProductIllustration type={product.type} size={86} />
          <View className="flex-1 gap-1">
            <Text className="text-[10px] font-sans-bold uppercase tracking-[1.4px] text-ink-faint">
              {product.brand}
            </Text>
            <Text className="font-display text-[22px] leading-[26px] text-ink">
              {product.name}
            </Text>
            <Text className="text-xs text-ink-muted">
              {[product.volume, `${product.ingredients.length} ingredients`]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {/* Formulas change. Saying when we last read the label is the
                difference between data and a claim. */}
            <Text className="text-[10.5px] text-ink-faint">
              Label read {relativeTime(Date.parse(product.fetchedAt ?? "") || Date.now())}
            </Text>
          </View>
        </View>

        <View className="mx-5 flex-row items-center gap-4 rounded-sheet bg-tint-mint p-4">
          <ScoreRing score={match.score} size={64} />
          <View className="flex-1 gap-1">
            <Text className="text-[15px] font-sans-bold text-ink">
              {match.score === null ? "Not enough to judge" : "Matched to your skin"}
            </Text>
            {summary ? (
              <Text className="text-xs leading-4 text-ink-muted">{summary}</Text>
            ) : null}
          </View>
        </View>

        <View className="flex-row gap-2 px-5 pb-2 pt-4">
          {(["All", "Actives", "Watch-outs"] as const).map((label) => {
            const active = tab === label;
            return (
              <Pressable
                key={label}
                onPress={() => setTab(label)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                className={`rounded-full px-3.5 py-2 ${active ? "bg-ink" : "bg-ink/[0.06]"}`}
              >
                <Text
                  className={`text-xs font-sans-semibold ${active ? "text-canvas" : "text-ink-muted"}`}
                >
                  {label}  {counts[label]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="gap-2 px-5 pt-1">
          {visible.length === 0 ? (
            <Text className="py-8 text-center text-sm text-ink-muted">
              Nothing in this group — which is good news.
            </Text>
          ) : (
            visible.map((ingredient) => (
              <IngredientCard
                key={ingredient.id}
                ingredient={ingredient}
                match={match}
                onPress={() =>
                  router.push({
                    pathname: "/ingredient/[inci]",
                    params: { inci: ingredient.name, product: product.id },
                  })
                }
              />
            ))
          )}
        </View>
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 flex-row gap-2.5 border-t border-hairline bg-canvas px-5 pb-8 pt-3">
        <Pressable
          onPress={() => router.replace("/scan")}
          className="h-[52px] flex-1 items-center justify-center rounded-full bg-ink active:opacity-80"
        >
          <Text className="text-[14.5px] font-sans-semibold text-canvas">Scan next product</Text>
        </Pressable>
        <Pressable
          onPress={() => toggleSaved(product.id)}
          className={`h-[52px] w-[52px] items-center justify-center rounded-full ${
            saved ? "bg-tint-pink" : "bg-ink/[0.06]"
          }`}
        >
          <Text className="text-lg text-ink">{saved ? "♥" : "♡"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function IngredientCard({
  ingredient,
  match,
  onPress,
}: {
  ingredient: Ingredient;
  match: MatchResult;
  onPress: () => void;
}) {
  const tone = ingredientTone(ingredient, match);
  const classes = TONE_CLASS[tone];
  const rule = ruleFor(ingredient);

  const subtitle = !isVerified(ingredient)
    ? "Not recognised — we can't assess this one"
    : (rule ? rule.reason.split("—")[0].trim() : functionLabel(ingredient));

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-card bg-surface p-3.5 shadow-sm active:opacity-80"
    >
      <View className={`h-2.5 w-2.5 rounded-full ${classes.dot}`} />
      <View className="flex-1 gap-0.5">
        <Text className="text-[13.5px] font-sans-semibold capitalize text-ink" numberOfLines={1}>
          {ingredient.name}
        </Text>
        <Text className="text-[11px] text-ink-muted" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View className={`rounded-full px-2.5 py-1 ${classes.pill}`}>
        <Text className="text-[10.5px] font-sans-bold text-ink">{TONE_PILL[tone]}</Text>
      </View>
      <Text className="text-[15px] text-ink-faint">›</Text>
    </Pressable>
  );
}

/** Falls back to the CosIng function list when no curated rule applies. */
function functionLabel(ingredient: Ingredient): string {
  return ingredient.functions && ingredient.functions.length > 0
    ? ingredient.functions.slice(0, 2).join(" · ")
    : "No concerns for your profile";
}
