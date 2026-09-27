import { router } from "expo-router";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FilterDropdown } from "@/components/FilterDropdown";
import { ProductRow } from "@/components/ProductRow";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { fetchProducts } from "@/data/api";
import { PRODUCT_TYPE_LABEL, type ProductType, type ProductWithIngredients } from "@/data/types";
import { matchProduct } from "@/lib/matching";
import { profileHeadline } from "@/lib/profile";
import { CANVAS, CHOSEN, FILTER_HIT_SLOP, FILTER_PILL, INK, MUTED, SPACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";
import { useFinderChoices } from "@/lib/finder-choices";

/**
 * The finder's results: every product in the catalogue, best match first for
 * the finder's answers. "Filter" narrows them to one product type (cleanser,
 * sunscreen…); "Edit" beside the answers goes back to the finder with them
 * still chosen, to change them and show again (owner).
 */
export default function FinderResults() {
  const insets = useSafeAreaInsets();
  // The finder's own answers, not the skin profile (owner): the scores here are
  // for what was chosen in the finder.
  const profile = useFinderChoices((s) => s.choices);
  const [products, setProducts] = useState<ProductWithIngredients[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [type, setType] = useState<ProductType | "all">("all");
  const listRef = useRef<FlatList<{ product: ProductWithIngredients; match: ReturnType<typeof matchProduct> }>>(null);
  // Choosing a type rebuilds a long list. As a transition, the dropdown closes
  // at once and the list follows, instead of the dropdown hanging open until
  // the rows are built (owner: switching felt slow). Back to the top, too: the
  // new list starts at its best match.
  const chooseType = (next: ProductType | "all") => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    startTransition(() => setType(next));
  };

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

  // The types the results hold, most products first, each with its count.
  const types = useMemo(() => {
    const counts = new Map<ProductType, number>();
    for (const { product } of ranked) {
      if (product.type !== "unknown") counts.set(product.type, (counts.get(product.type) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [ranked]);
  // A type the results no longer hold falls back to All rather than an empty list.
  const activeType = type !== "all" && types.some(([t]) => t === type) ? type : "all";
  const shown = activeType === "all" ? ranked : ranked.filter(({ product }) => product.type === activeType);

  const { title, tags } = profileHeadline(profile);
  const chosen = [...(profile.baseSkinType ? [title] : []), ...tags];

  const header = (
    <View style={{ gap: SPACE.block, paddingHorizontal: 20, paddingTop: SPACE.text, paddingBottom: SPACE.block }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text accessibilityRole="header" style={{ fontSize: TYPE.heading, fontWeight: "700", color: INK }}>
          Results
        </Text>
        {types.length > 1 ? (
          <FilterDropdown
            align="end"
            options={[
              { value: "all", label: "All", count: ranked.length },
              ...types.map(([t, count]) => ({ value: t, label: PRODUCT_TYPE_LABEL[t], count })),
            ]}
            selected={activeType}
            onSelect={chooseType}
          />
        ) : null}
      </View>
      {/* The finder's answers, and Edit to change them on the finder. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 8 }}>
          {chosen.map((label) => (
            <View key={label} style={{ height: FILTER_PILL.height, justifyContent: "center", borderRadius: FILTER_PILL.radius, paddingHorizontal: 14, borderWidth: 1.5, borderColor: CHOSEN.border, backgroundColor: CHOSEN.fill }}>
              <Text style={{ fontSize: FILTER_PILL.fontSize, fontWeight: "600", color: CHOSEN.label }}>{label}</Text>
            </View>
          ))}
        </ScrollView>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/finder"))}
          accessibilityRole="button"
          accessibilityLabel="Edit your answers"
          hitSlop={FILTER_HIT_SLOP}
          style={{ minHeight: FILTER_PILL.height, justifyContent: "center" }}
          className="active:opacity-70"
        >
          <Text style={{ fontSize: FILTER_PILL.fontSize, fontWeight: "600", color: CHOSEN.accent }}>Edit</Text>
        </Pressable>
      </View>
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
          ref={listRef}
          data={shown}
          // Only a few screens of rows are built ahead of the one showing, so
          // a new filter has little to build before it appears.
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          keyExtractor={({ product }) => product.id}
          renderItem={({ item }) => <ProductRow product={item.product} match={item.match} saveable />}
          ListHeaderComponent={header}
          // The Filter's card floats over the rows below the header.
          ListHeaderComponentStyle={{ zIndex: 10 }}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", paddingHorizontal: 40, paddingTop: 48, fontSize: TYPE.body, color: MUTED }}>
              Nothing to rank yet. Add your skin type or a concern with Edit.
            </Text>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.gutter }}
        />
      )}
    </View>
  );
}
