import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { Text } from "@/components/Text";

import { ProductIllustration } from "@/components/ProductIllustration";
import { SafetyPill } from "@/components/SafetyPill";
import { fetchProductsByIds } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { formatKRW } from "@/lib/format";
import { matchProduct } from "@/lib/matching";
import { flaggedIngredients } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

export default function Compare() {
  const compareIds = useAppStore((s) => s.compareIds);
  const clearCompare = useAppStore((s) => s.clearCompare);
  const profile = useAppStore((s) => s.profile);

  const [products, setProducts] = useState<ProductWithIngredients[] | null>(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setProducts(null);
    setError(false);
    fetchProductsByIds(compareIds)
      .then((result) => {
        if (!cancelled) setProducts(result);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("fetchProductsByIds failed:", err);
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [compareIds, retryKey]);

  if (compareIds.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-surface px-8">
        <Text className="text-center text-base text-ink-muted">
          Nothing selected yet. Add two products from the browse screen.
        </Text>
        <Link href="/" className="font-sans-semibold text-accent-text underline">
          Back to browse
        </Link>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-surface px-8">
        <Text className="text-center text-base text-ink-muted">
          Couldn&apos;t load these products. Check your connection and try again.
        </Text>
        <Pressable onPress={() => setRetryKey((k) => k + 1)}>
          <Text className="font-sans-semibold text-accent-text underline">Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (products === null) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView contentContainerClassName="p-4 pb-24">
        {compareIds.length === 1 && (
          <Text className="mb-3 rounded-chip bg-tint-peach p-3 text-xs text-ink">
            Pick one more product to see a side-by-side.
          </Text>
        )}

        {/* Two fixed columns, so the comparison reads top-to-bottom in pairs. */}
        <View className="flex-row gap-3">
          {products.map((product) => {
            const { score } = matchProduct(product, profile);
            const flaggedCount = flaggedIngredients(product.ingredients).length;

            return (
              <View
                key={product.id}
                className="flex-1 rounded-card bg-surface p-3 shadow-md"
              >
                <ProductIllustration type={product.type} size={40} />
                <Text className="mt-2 text-[11px] font-sans-semibold uppercase tracking-wide text-ink-faint">
                  {product.brand}
                </Text>
                <Text
                  className="mt-1 text-sm font-sans-semibold leading-5 text-ink"
                  numberOfLines={3}
                >
                  {product.name}
                </Text>

                <View className="mt-3 gap-1.5 border-t border-hairline pt-3">
                  <Row label="Match" value={score === null ? "—" : `${score}%`} />
                  <Row label="Price" value={formatKRW(product.price)} />
                  <Row label="Size" value={product.volume} />
                  <Row
                    label="Ingredients"
                    value={String(product.ingredients.length)}
                  />
                  <Row
                    label="Flagged"
                    value={String(flaggedCount)}
                    tone={flaggedCount > 0 ? "warn" : "ok"}
                  />
                </View>

                <Text className="mt-4 text-[11px] font-sans-semibold uppercase tracking-wide text-ink-faint">
                  Ingredients
                </Text>
                <View className="mt-1.5 gap-1.5">
                  {product.ingredients.map((ingredient) => (
                    <View key={ingredient.id} className="gap-1">
                      <Text
                        className="text-xs leading-4 text-ink-muted"
                        numberOfLines={2}
                      >
                        {ingredient.name}
                      </Text>
                      <View className="flex-row">
                        <SafetyPill level={ingredient.safety} />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 border-t border-hairline bg-surface p-4">
        <Pressable
          onPress={clearCompare}
          className="rounded-control border border-hairline py-3 active:bg-canvas"
        >
          <Text className="text-center text-sm font-sans-semibold text-ink">
            Clear comparison
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "ok" | "warn";
}) {
  const valueClass =
    tone === "warn" ? "text-status-avoid" : tone === "ok" ? "text-status-safe" : "text-ink";
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Text className="text-[11px] text-ink-faint">{label}</Text>
      <Text className={`text-xs font-sans-semibold tabular-nums ${valueClass}`}>{value}</Text>
    </View>
  );
}
