import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { Text } from "@/components/Text";

import { IngredientRow } from "@/components/IngredientRow";
import { MatchBadge } from "@/components/MatchBadge";
import { ProductIllustration } from "@/components/ProductIllustration";
import { fetchProduct } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { formatKRW } from "@/lib/format";
import { matchProduct } from "@/lib/matching";
import { groupByRisk, type RiskGroup } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

const TIER_META: Record<RiskGroup, { label: string; icon: string; color: string }> = {
  avoid: { label: "Needs a closer look", icon: "!", color: "bg-status-avoid" },
  caution: { label: "Some caution", icon: "•", color: "bg-status-caution" },
  clean: { label: "No concerns", icon: "✓", color: "bg-status-safe" },
};
const TIER_ORDER: RiskGroup[] = ["avoid", "caution", "clean"];

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<ProductWithIngredients | null>(null);
  const [loading, setLoading] = useState(true);

  const profile = useAppStore((s) => s.profile);
  const savedProducts = useAppStore((s) => s.savedProducts);
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const recordView = useAppStore((s) => s.recordView);
  const saved = savedProducts.some((p) => p.id === id);
  const loggedId = useRef<string | null>(null);

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

  // Opening a product logs it, so "have I already checked this?" is answerable
  // without the user having had the foresight to save it. Keyed on the product
  // alone and guarded by a ref: reading the profile through `getState` keeps a
  // later profile edit from re-firing this and inflating the view count.
  useEffect(() => {
    if (!product || loggedId.current === product.id) return;
    loggedId.current = product.id;
    const { score, warnings } = matchProduct(product, useAppStore.getState().profile);
    recordView({ id: product.id, known: true, score, warnings: warnings.length });
  }, [product, recordView]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (!product) {
    return (
      <View className="flex-1 items-center justify-center bg-surface px-6">
        <Text className="text-ink-muted">Product not found.</Text>
      </View>
    );
  }

  const { score } = matchProduct(product, profile);
  const riskGroups = groupByRisk(product.ingredients);

  return (
    <ScrollView className="flex-1 bg-canvas">
      <Stack.Screen options={{ title: product.brand }} />

      <View className="bg-surface px-4 pb-5 pt-4">
        <View className="flex-row items-start gap-3">
          <ProductIllustration type={product.type} size={72} />
          <View className="flex-1">
            <View className="flex-row items-start justify-between gap-3">
              <Text className="flex-1 text-xs font-sans-semibold uppercase tracking-wide text-ink-faint">
                {product.brand} · {product.type}
              </Text>
              <MatchBadge score={score} />
            </View>
            <Text className="mt-1 font-display text-2xl leading-7 text-ink">{product.name}</Text>
          </View>
        </View>

        <Text className="mt-2 text-sm leading-5 text-ink-muted">{product.description}</Text>

        <View className="mt-3 flex-row items-center gap-2">
          <Text className="text-base font-sans-semibold tabular-nums text-ink">
            {formatKRW(product.price)}
          </Text>
          <Text className="text-sm text-ink-faint">{product.volume}</Text>
          {!product.inStock && (
            <Text className="text-sm font-sans-semibold text-status-avoid">Out of stock</Text>
          )}
        </View>

        <Pressable
          onPress={() => toggleSaved(product.id)}
          className={`mt-4 rounded-control border-2 py-3 ${
            saved
              ? "border-accent bg-tint-lilac active:bg-hairline"
              : "border-hairline bg-surface active:bg-canvas"
          }`}
        >
          <Text
            className={`text-center text-sm font-sans-semibold ${
              saved ? "text-accent-text" : "text-ink"
            }`}
          >
            {saved ? "♥ Saved" : "♡ Save"}
          </Text>
        </Pressable>
      </View>

      <Text className="px-4 pb-2 pt-6 text-xs font-sans-semibold uppercase tracking-wide text-ink-faint">
        Ingredients ({product.ingredients.length})
      </Text>

      <View className="mb-10 gap-3 px-4">
        {TIER_ORDER.map((tier) => {
          const items = riskGroups[tier];
          if (items.length === 0) return null;
          const meta = TIER_META[tier];

          return (
            <View
              key={tier}
              className="overflow-hidden rounded-card bg-surface shadow-md"
            >
              <View className="flex-row items-center gap-2 px-4 pb-2 pt-4">
                <View className={`h-6 w-6 items-center justify-center rounded-full ${meta.color}`}>
                  <Text className="text-xs font-sans-bold text-white">{meta.icon}</Text>
                </View>
                <Text className="text-sm font-sans-semibold text-ink">{meta.label}</Text>
                <Text className="text-xs tabular-nums text-ink-faint">({items.length})</Text>
              </View>

              {items.map((ingredient) => (
                <IngredientRow key={ingredient.id} ingredient={ingredient} />
              ))}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
