import { Image } from "expo-image";
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
  unknown: { label: "We couldn't identify these", icon: "?", color: "bg-ink-faint" },
};
// "unknown" sits last but above nothing: it is the honest tail of the list,
// not a footnote. Crowdsourced labels are often OCR-mangled, and these are the
// names we could not match to a dictionary.
const TIER_ORDER: RiskGroup[] = ["avoid", "caution", "unknown", "clean"];

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
    fetchProduct(id)
      .then((result) => {
        if (cancelled) return;
        setProduct(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("fetchProduct failed:", err);
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
          {/*
            A real packaging photo when the source has one, and the pastel
            vessel when it doesn't — which is often, so the fallback is a
            first-class path rather than an error state.
          */}
          {product.imageUrl ? (
            <Image
              source={{ uri: product.imageUrl }}
              style={{ width: 72, height: 72, borderRadius: 14 }}
              contentFit="contain"
              transition={150}
              accessibilityLabel={`${product.brand} ${product.name}`}
            />
          ) : (
            <ProductIllustration type={product.type} size={72} />
          )}
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

      <View className="gap-3 px-4">
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

      {/*
        Required by the INCI API terms, which forbid presenting their data as
        medically validated without a disclaimer — and true regardless, since
        `lib/matching.ts` is still an explicit placeholder.
      */}
      <View className="mx-4 mb-4 mt-6 rounded-card bg-tint-lilac px-4 py-3">
        <Text className="text-xs leading-4 text-accent-text">
          Ingredient information only — not medical or dermatological advice.
          Formulas change, and label data can be out of date or incomplete.
          Check the packaging and ask a professional about anything that matters.
        </Text>
      </View>

      {product.attribution ? (
        <Text className="mb-10 px-4 text-[11px] leading-4 text-ink-faint">
          {product.attribution}
        </Text>
      ) : (
        <View className="mb-10" />
      )}
    </ScrollView>
  );
}
