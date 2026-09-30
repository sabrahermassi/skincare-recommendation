import { router } from "expo-router";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FilterDropdown } from "@/components/FilterDropdown";
import { PageTitle } from "@/components/PageTitle";
import { ProductListRow } from "@/components/ProductListRow";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { fetchProducts } from "@/data/api";
import { PRODUCT_TYPE_LABEL, type Concern, type ProductType, type ProductWithIngredients } from "@/data/types";
import { concernSupport, matchProduct } from "@/lib/matching";
import { CONCERN_PHRASE, profileHeadline } from "@/lib/profile";
import { CANVAS, CARD_RADIUS, CHOSEN, INK, LINK, MUTED, SPACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";
import { FROM_FINDER, useFinderChoices } from "@/lib/finder-choices";

/** v7: the gap between result cards. */
function RowGap() {
  return <View style={{ height: SPACE.block }} />;
}

/**
 * "Softwell · Helps your dark spots and acne": the brand, and which of the
 * finder's concerns an ingredient in it helps — by the same rules the product
 * page's reasons use (`concernSupport`). Just the brand when none does.
 */
function whyLine(product: ProductWithIngredients, concerns: Concern[]): string {
  const helped = concerns.filter((concern) => concernSupport(product.ingredients, concern) !== null).map((c) => CONCERN_PHRASE[c]);
  if (helped.length === 0) return product.brand;
  const list = helped.length === 1 ? helped[0] : `${helped.slice(0, -1).join(", ")} and ${helped[helped.length - 1]}`;
  return `${product.brand} · Helps your ${list}`;
}

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
    <View style={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.text }}>
      <PageTitle title="Skincare finder" line="Best matches for your skin first." />
      {/* The finder's answers, and Edit to change them on the finder (v7). */}
      <View style={{ marginTop: SPACE.gutter, minHeight: 56, flexDirection: "row", alignItems: "center", gap: SPACE.block, borderRadius: CARD_RADIUS, paddingLeft: SPACE.gutter, paddingRight: SPACE.text, backgroundColor: CHOSEN.fill }}>
        <Text numberOfLines={2} style={{ flex: 1, fontSize: TYPE.body, color: INK }}>
          {chosen.join(" · ")}
        </Text>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/finder"))}
          accessibilityRole="button"
          accessibilityLabel="Edit your answers"
          style={{ minHeight: TOUCH_TARGET, paddingHorizontal: SPACE.block, justifyContent: "center" }}
          className="active:opacity-70"
        >
          <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>Edit</Text>
        </Pressable>
      </View>
      <View style={{ paddingTop: SPACE.gutter, paddingBottom: SPACE.text, paddingLeft: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text accessibilityRole="header" style={{ fontSize: TYPE.caption, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: MUTED }}>
          {shown.length} {shown.length === 1 ? "product" : "products"}
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
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader />
      {failed ? (
        <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 40, paddingTop: 96 }}>
          <Text style={{ textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>
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
            <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>Try again</Text>
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
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: SPACE.gutter }}>
              <ProductListRow
                product={item.product}
                score={item.match.score}
                href={{ pathname: "/product/[id]", params: { id: item.product.id, from: FROM_FINDER } }}
                detail={whyLine(item.product, profile.concerns)}
                chevron
              />
            </View>
          )}
          ItemSeparatorComponent={RowGap}
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
