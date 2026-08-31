import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import type { Product } from "@/data/types";
import { formatKRW } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";
import { MatchBadge } from "./MatchBadge";

type Props = {
  product: Product;
  score: number;
};

export function ProductCard({ product, score }: Props) {
  const compareIds = useAppStore((s) => s.compareIds);
  const toggleCompare = useAppStore((s) => s.toggleCompare);
  const inCompare = compareIds.includes(product.id);

  return (
    <View className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <Link href={`/product/${product.id}`} asChild>
        <Pressable className="p-4 active:bg-slate-50">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                {product.brand} · {product.type}
              </Text>
              <Text className="mt-1 text-base font-bold text-slate-900">
                {product.name}
              </Text>
            </View>
            <MatchBadge score={score} />
          </View>

          <Text className="mt-2 text-sm text-slate-500" numberOfLines={2}>
            {product.description}
          </Text>

          <View className="mt-3 flex-row items-center gap-2">
            <Text className="text-sm font-semibold text-slate-900">
              {formatKRW(product.price)}
            </Text>
            <Text className="text-xs text-slate-400">{product.volume}</Text>
            {!product.inStock && (
              <Text className="text-xs font-semibold text-rose-600">
                Out of stock
              </Text>
            )}
          </View>
        </Pressable>
      </Link>

      <Pressable
        onPress={() => toggleCompare(product.id)}
        className={`border-t border-slate-200 px-4 py-2.5 ${
          inCompare ? "bg-teal-600 active:bg-teal-700" : "active:bg-slate-100"
        }`}
      >
        <Text
          className={`text-center text-sm font-semibold ${
            inCompare ? "text-white" : "text-teal-700"
          }`}
        >
          {inCompare ? "✓ In compare" : "Add to compare"}
        </Text>
      </Pressable>
    </View>
  );
}
