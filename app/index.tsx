import { Link, Redirect } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { Chip } from "@/components/Chip";
import { ProductCard } from "@/components/ProductCard";
import { fetchProducts } from "@/data/api";
import type { ProductType, ProductWithIngredients } from "@/data/types";
import { matchProduct } from "@/lib/matching";
import { useAppStore } from "@/store/useAppStore";

const TYPE_FILTERS: (ProductType | "all")[] = [
  "all",
  "serum",
  "ampoule",
  "moisturizer",
  "sunscreen",
  "cleanser",
];

export default function Browse() {
  const [products, setProducts] = useState<ProductWithIngredients[] | null>(null);
  const [typeFilter, setTypeFilter] = useState<ProductType | "all">("all");

  const hasSeenOnboarding = useAppStore((s) => s.hasSeenOnboarding);
  const skinType = useAppStore((s) => s.skinType);
  const concerns = useAppStore((s) => s.concerns);
  const compareIds = useAppStore((s) => s.compareIds);
  const editProfile = useAppStore((s) => s.editProfile);

  useEffect(() => {
    let cancelled = false;
    setProducts(null);
    fetchProducts({ type: typeFilter }).then((result) => {
      if (!cancelled) setProducts(result);
    });
    return () => {
      cancelled = true;
    };
  }, [typeFilter]);

  // Highest match first — the point of the profile.
  const scored = useMemo(() => {
    if (!products) return null;
    return products
      .map((product) => ({
        product,
        match: matchProduct(product, skinType, concerns),
      }))
      .sort((a, b) => b.match.score - a.match.score);
  }, [products, skinType, concerns]);

  // First run goes to onboarding. Declarative, so it cannot fire before the
  // navigator mounts and cannot ping-pong the way an effect-based gate can.
  if (!hasSeenOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <View className="flex-1 bg-slate-50">
      <View className="border-b border-slate-200 bg-white pb-3 pt-2">
        <View className="flex-row items-center justify-between gap-3 px-4 pb-2">
          <Text className="flex-1 text-xs text-slate-500">
            {skinType
              ? `Matched to ${skinType} skin${
                  concerns.length ? ` · ${concerns.join(", ")}` : ""
                }`
              : "No profile yet — showing default scores"}
          </Text>
          {/* Re-enters onboarding pre-filled. Keeps the wishlist. */}
          <Pressable onPress={editProfile} hitSlop={8}>
            <Text className="text-xs font-semibold text-teal-700">Edit</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-4"
        >
          {TYPE_FILTERS.map((type) => (
            <Chip
              key={type}
              label={type === "all" ? "All" : type}
              selected={typeFilter === type}
              onPress={() => setTypeFilter(type)}
            />
          ))}
        </ScrollView>
      </View>

      {scored === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0d9488" />
        </View>
      ) : (
        <FlatList
          data={scored}
          keyExtractor={(item) => item.product.id}
          contentContainerClassName="p-4 pb-28"
          renderItem={({ item }) => (
            <ProductCard product={item.product} match={item.match} />
          )}
          ListEmptyComponent={
            <Text className="mt-12 text-center text-slate-400">
              No products of this type yet.
            </Text>
          }
        />
      )}

      {/* Compare tray — only appears once something is selected. */}
      {compareIds.length > 0 && (
        <View className="absolute inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4">
          <Link href="/compare" asChild>
            <Pressable className="rounded-xl bg-slate-900 py-3.5 active:bg-slate-700">
              <Text className="text-center text-base font-semibold text-white">
                Compare {compareIds.length} selected
                {compareIds.length === 1 ? " — pick one more" : ""}
              </Text>
            </Pressable>
          </Link>
        </View>
      )}
    </View>
  );
}
