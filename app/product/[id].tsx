import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { IngredientRow } from "@/components/IngredientRow";
import { MatchBadge } from "@/components/MatchBadge";
import { fetchProduct } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { formatKRW } from "@/lib/format";
import { matchProduct } from "@/lib/matching";
import { flaggedIngredients } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<ProductWithIngredients | null>(null);
  const [loading, setLoading] = useState(true);

  const skinType = useAppStore((s) => s.skinType);
  const concerns = useAppStore((s) => s.concerns);
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

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#0d9488" />
      </View>
    );
  }

  if (!product) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-slate-500">Product not found.</Text>
      </View>
    );
  }

  const { score } = matchProduct(product, skinType, concerns);
  const flagged = flaggedIngredients(product.ingredients);

  return (
    <ScrollView className="flex-1 bg-slate-50">
      <Stack.Screen options={{ title: product.brand }} />

      <View className="bg-white px-4 pb-5 pt-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-xs font-semibold uppercase tracking-wide text-teal-700">
              {product.brand} · {product.type}
            </Text>
            <Text className="mt-1 text-2xl font-bold text-slate-900">
              {product.name}
            </Text>
          </View>
          <MatchBadge score={score} />
        </View>

        <Text className="mt-2 text-sm leading-5 text-slate-500">
          {product.description}
        </Text>

        <View className="mt-3 flex-row items-center gap-2">
          <Text className="text-base font-semibold text-slate-900">
            {formatKRW(product.price)}
          </Text>
          <Text className="text-sm text-slate-400">{product.volume}</Text>
          {!product.inStock && (
            <Text className="text-sm font-semibold text-rose-600">
              Out of stock
            </Text>
          )}
        </View>

        <Pressable
          onPress={() => toggleSaved(product.id)}
          className={`mt-4 rounded-xl border py-3 ${
            saved
              ? "border-teal-600 bg-teal-50 active:bg-teal-100"
              : "border-slate-300 bg-white active:bg-slate-50"
          }`}
        >
          <Text
            className={`text-center text-sm font-semibold ${
              saved ? "text-teal-800" : "text-slate-700"
            }`}
          >
            {saved ? "♥ Saved to wishlist" : "♡ Save to wishlist"}
          </Text>
        </Pressable>
      </View>

      {/* Summary banner — the quick read before the full INCI list. */}
      <View
        className={`mx-4 mt-4 rounded-xl border p-4 ${
          flagged.length
            ? "border-amber-300 bg-amber-50"
            : "border-teal-300 bg-teal-50"
        }`}
      >
        <Text
          className={`text-sm font-bold ${
            flagged.length ? "text-amber-900" : "text-teal-900"
          }`}
        >
          {flagged.length
            ? `${flagged.length} ingredient${
                flagged.length === 1 ? "" : "s"
              } worth a look`
            : "No flagged ingredients"}
        </Text>
        {flagged.length > 0 && (
          <Text className="mt-1 text-xs text-amber-800">
            {flagged.map((i) => i.name).join(", ")}
          </Text>
        )}
      </View>

      <Text className="px-4 pb-2 pt-6 text-xs font-bold uppercase tracking-wide text-slate-400">
        Full ingredient list ({product.ingredients.length})
      </Text>

      <View className="mb-10 border-t border-slate-100 bg-white">
        {product.ingredients.map((ingredient) => (
          <IngredientRow key={ingredient.id} ingredient={ingredient} />
        ))}
      </View>
    </ScrollView>
  );
}
