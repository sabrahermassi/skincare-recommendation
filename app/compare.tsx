import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { SafetyPill } from "@/components/SafetyPill";
import { fetchProductsByIds } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { formatKRW } from "@/lib/format";
import { matchScore } from "@/lib/matching";
import { useAppStore } from "@/store/useAppStore";

export default function Compare() {
  const compareIds = useAppStore((s) => s.compareIds);
  const clearCompare = useAppStore((s) => s.clearCompare);
  const skinType = useAppStore((s) => s.skinType);
  const concerns = useAppStore((s) => s.concerns);

  const [products, setProducts] = useState<ProductWithIngredients[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProducts(null);
    fetchProductsByIds(compareIds).then((result) => {
      if (!cancelled) setProducts(result);
    });
    return () => {
      cancelled = true;
    };
  }, [compareIds]);

  if (compareIds.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-white px-8">
        <Text className="text-center text-base text-slate-500">
          Nothing selected yet. Add two products from the browse screen.
        </Text>
        <Link href="/" className="font-semibold text-teal-700 underline">
          Back to browse
        </Link>
      </View>
    );
  }

  if (products === null) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#0d9488" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView contentContainerClassName="p-4 pb-24">
        {compareIds.length === 1 && (
          <Text className="mb-3 rounded-lg bg-amber-100 p-3 text-xs text-amber-900">
            Pick one more product to see a side-by-side.
          </Text>
        )}

        {/* Two fixed columns, so the comparison reads top-to-bottom in pairs. */}
        <View className="flex-row gap-3">
          {products.map((product) => {
            const score = matchScore(product, skinType, concerns);
            const flaggedCount = product.ingredients.filter(
              (i) => i.comedogenic >= 3 || i.safety !== "safe"
            ).length;

            return (
              <View
                key={product.id}
                className="flex-1 rounded-2xl border border-slate-200 bg-white p-3"
              >
                <Text className="text-[11px] font-semibold uppercase text-teal-700">
                  {product.brand}
                </Text>
                <Text
                  className="mt-1 text-sm font-bold leading-5 text-slate-900"
                  numberOfLines={3}
                >
                  {product.name}
                </Text>

                <View className="mt-3 gap-1.5 border-t border-slate-100 pt-3">
                  <Row label="Match" value={`${score}%`} />
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

                <Text className="mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Ingredients
                </Text>
                <View className="mt-1.5 gap-1.5">
                  {product.ingredients.map((ingredient) => (
                    <View key={ingredient.id} className="gap-1">
                      <Text
                        className="text-xs leading-4 text-slate-700"
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

      <View className="absolute inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4">
        <Pressable
          onPress={clearCompare}
          className="rounded-xl border border-slate-300 py-3 active:bg-slate-100"
        >
          <Text className="text-center text-sm font-semibold text-slate-700">
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
    tone === "warn"
      ? "text-rose-700"
      : tone === "ok"
        ? "text-teal-700"
        : "text-slate-900";
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Text className="text-[11px] text-slate-400">{label}</Text>
      <Text className={`text-xs font-semibold ${valueClass}`}>{value}</Text>
    </View>
  );
}
