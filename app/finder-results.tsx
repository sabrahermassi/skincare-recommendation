import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductRow } from "@/components/ProductRow";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { fetchProducts } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { matchProduct } from "@/lib/matching";
import { profileHeadline } from "@/lib/profile";
import { BUTTON, CANVAS, CHOSEN, INK, MUTED, SPACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";
import { useFinderChoices } from "@/lib/finder-choices";

/**
 * The finder's results: every product in the catalogue, best match first for
 * the finder's answers. "Filter" goes back to the finder with the answers
 * still chosen, to change them and show again.
 */
export default function FinderResults() {
  const insets = useSafeAreaInsets();
  // The finder's own answers, not the skin profile (owner): the scores here are
  // for what was chosen in the finder.
  const profile = useFinderChoices((s) => s.choices);
  const [products, setProducts] = useState<ProductWithIngredients[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      .then((all) => {
        if (!cancelled) setProducts(all);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  const ranked = useMemo(
    () =>
      (products ?? [])
        .map((product) => ({ product, match: matchProduct(product, profile) }))
        .filter(({ match }) => match.score !== null)
        .sort((a, b) => (b.match.score ?? 0) - (a.match.score ?? 0)),
    [products, profile],
  );

  const { title, tags } = profileHeadline(profile);
  const chosen = [...(profile.baseSkinType ? [title] : []), ...tags];

  const header = (
    <View style={{ gap: SPACE.block, paddingHorizontal: 20, paddingTop: SPACE.text, paddingBottom: SPACE.block }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text accessibilityRole="header" style={{ fontSize: TYPE.heading, fontWeight: "700", color: INK }}>
          Results
        </Text>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/finder"))}
          accessibilityRole="button"
          accessibilityLabel="Filter"
          className="active:opacity-80"
          style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: TOUCH_TARGET, paddingHorizontal: 18, borderRadius: 999, backgroundColor: BUTTON.primary.fill }}
        >
          <Ionicons name="options-outline" size={20} color={BUTTON.primary.label} />
          <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: BUTTON.primary.label }}>Filter</Text>
        </Pressable>
      </View>
      {chosen.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {chosen.map((label) => (
            <View key={label} style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: CHOSEN.fill }}>
              <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: CHOSEN.label }}>{label}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader title="Skincare finder" />
      {failed ? (
        <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 40, paddingTop: 96 }}>
          <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>
            Couldn&apos;t load the products. Check your connection and try again.
          </Text>
          <Pressable
            onPress={() => {
              setFailed(false);
              setRetryKey((k) => k + 1);
            }}
            accessibilityRole="button"
            style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }}
            className="active:opacity-70"
          >
            <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>Try again</Text>
          </Pressable>
        </View>
      ) : products === null ? (
        <View style={{ alignItems: "center", paddingTop: 96 }}>
          <ActivityIndicator color={INK} accessibilityLabel="Loading" />
        </View>
      ) : (
        <FlatList
          data={ranked}
          keyExtractor={({ product }) => product.id}
          renderItem={({ item }) => <ProductRow product={item.product} match={item.match} />}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", paddingHorizontal: 40, paddingTop: 48, fontSize: TYPE.body, color: MUTED }}>
              Nothing to rank yet. Add your skin type or a concern with Filter.
            </Text>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.gutter }}
        />
      )}
    </View>
  );
}
