import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, TextInput, View, type ListRenderItem } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { AppHeader, HEADER_GUTTER } from "@/components/AppHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProductRow } from "@/components/ProductRow";
import { ProductRowSkeleton } from "@/components/ProductRowSkeleton";
// One selected-outline color app-wide — see profile.tsx's own note on why
// this FOR.ME shell token is reused outside its original scope.
import { TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import { fetchProducts, peekProducts, searchProducts } from "@/data/api";
import { PRODUCT_TYPE_LABEL, type ProductType, type ProductWithIngredients } from "@/data/types";
import { matchProduct, type MatchResult } from "@/lib/matching";
import { isPersonalized, profileSummary } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, MUTED_FAINT, RADIUS_SELECTOR, SELECTED, TOUCH_TARGET } from "@/lib/tokens";

// The design system (design/DESIGN_SYSTEM.md).

// One list, every product type together. This used to split into a
// face-only set and a body-only set, chosen by the profile's `area` field —
// removed along with `area` itself: the app's whole premise is judging a
// formula against a skin profile, not filtering products out by which part
// of the body they're for before that judgement even happens.
const TYPE_FILTERS: (ProductType | "all")[] = [
  "all",
  "cleanser",
  "toner",
  "essence",
  "serum",
  "ampoule",
  "moisturizer",
  "sunscreen",
  "body-wash",
  "body-lotion",
  "hand-cream",
];

// "unknown" is never in TYPE_FILTERS above — it's not a category to browse
// by — but the Record still needs the key, and PRODUCT_TYPE_LABEL is the one
// place that label is defined.
const TYPE_LABEL: Record<ProductType | "all", string> = {
  all: "All",
  ...PRODUCT_TYPE_LABEL,
};

// Which chip the screen opens on. Named because two pieces of state read it —
// the filter itself and the cache peek that seeds the first frame — and they
// have to agree or the list paints one filter's rows under another's chip.
const INITIAL_TYPE_FILTER: ProductType | "all" = "all";

// How many placeholder rows stand in for the real list while it loads —
// enough to fill a phone screen without pretending to know the real count.
const SKELETON_ROWS = 6;

// The FlatList's `data` is one of these per row, rather than always being a
// scored product — the type-filter chips, the personalize banner, loading
// placeholders and the empty/error states all need to scroll (and, for the
// chips, stick) the same way a product row does, and a `FlatList` can only
// virtualize a single flat array.
type BrowseItem =
  | { kind: "filters" }
  | { kind: "banner" }
  | { kind: "skeleton"; id: string }
  | { kind: "error" }
  | { kind: "empty-catalog" }
  | { kind: "empty-search" }
  | { kind: "product"; product: ProductWithIngredients; match: MatchResult };

function skeletonRows(): BrowseItem[] {
  return Array.from({ length: SKELETON_ROWS }, (_, i) => ({ kind: "skeleton", id: `skeleton-${i}` }));
}

export default function Browse() {
  const insets = useSafeAreaInsets();
  // Seeded from the catalogue cache so a warm start paints rows on the first
  // frame instead of a skeleton. Null on a cold start, exactly as before.
  const [products, setProducts] = useState<ProductWithIngredients[] | null>(() =>
    peekProducts(INITIAL_TYPE_FILTER),
  );
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [typeFilter, setTypeFilter] = useState<ProductType | "all">(INITIAL_TYPE_FILTER);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Search overrides the type-filtered browse list entirely while active,
  // the same way Search is its own mode on the Scan tab rather than a
  // filter layered on top of Barcode. `searchResults` is null until a query
  // of at least 2 characters has actually been searched.
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductWithIngredients[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchActive = query.trim().length >= 2;

  const profile = useAppStore((s) => s.profile);

  const personalized = isPersonalized(profile);

  useEffect(() => {
    let cancelled = false;
    // Cached: swap to the new filter's rows immediately. Cold: clear, so the
    // previous filter's products don't sit under the new chip while the
    // network answers — which is what the unconditional reset here used to be
    // for, back when every chip tap was a round trip.
    setProducts(peekProducts(typeFilter));
    setError(false);
    fetchProducts({ type: typeFilter })
      .then((result) => {
        if (!cancelled) setProducts(result);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("fetchProducts failed:", err);
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [typeFilter, retryKey]);

  // Debounced the same way the Scan tab's Search pane is: a query per
  // keystroke would hammer the backend for nothing.
  useEffect(() => {
    if (!searchActive) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      searchProducts(query)
        .then((found) => {
          if (!cancelled) setSearchResults(found);
        })
        .catch((err) => {
          console.warn("searchProducts failed:", err);
          if (!cancelled) setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchActive]);

  const scored = useMemo(() => {
    if (!products) return null;
    const withScores = products.map((product) => ({
      product,
      match: matchProduct(product, profile),
    }));
    // Sorting by score only makes sense once there's a score to sort by —
    // otherwise it silently reorders the catalogue for no reason.
    if (!personalized) return withScores;
    return [...withScores].sort((a, b) => (b.match.score ?? 0) - (a.match.score ?? 0));
  }, [products, profile, personalized]);

  const scoredSearch = useMemo(() => {
    if (!searchResults) return null;
    const withScores = searchResults.map((product) => ({
      product,
      match: matchProduct(product, profile),
    }));
    if (!personalized) return withScores;
    return [...withScores].sort((a, b) => (b.match.score ?? 0) - (a.match.score ?? 0));
  }, [searchResults, profile, personalized]);

  // Everything the list scrolls, as one flat array — see `BrowseItem`. The
  // type-filter chips are index 0 here and land at index 1 once
  // `ListHeaderComponent` (index 0) is counted in, which is what
  // `stickyHeaderIndices={[1]}` below targets — same position `[1]` held on
  // the plain `ScrollView` this replaced.
  const items = useMemo<BrowseItem[]>(() => {
    if (searchActive) {
      if (searching) return skeletonRows();
      if (scoredSearch === null || scoredSearch.length === 0) return [{ kind: "empty-search" }];
      return scoredSearch.map(({ product, match }) => ({ kind: "product", product, match }) as const);
    }

    const list: BrowseItem[] = [{ kind: "filters" }];
    if (!personalized && !bannerDismissed) list.push({ kind: "banner" });

    if (error) {
      list.push({ kind: "error" });
    } else if (scored === null) {
      list.push(...skeletonRows());
    } else if (scored.length === 0) {
      list.push({ kind: "empty-catalog" });
    } else {
      list.push(...scored.map(({ product, match }) => ({ kind: "product", product, match }) as const));
    }
    return list;
  }, [searchActive, searching, scoredSearch, error, scored, personalized, bannerDismissed]);

  const renderItem: ListRenderItem<BrowseItem> = ({ item }) => {
    switch (item.kind) {
      case "filters":
        return (
          <View style={{ paddingBottom: 16, backgroundColor: CANVAS }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: HEADER_GUTTER, paddingTop: 10 }}
            >
              {TYPE_FILTERS.map((type) => (
                <TypeChip
                  key={type}
                  label={TYPE_LABEL[type]}
                  selected={typeFilter === type}
                  onPress={() => setTypeFilter(type)}
                />
              ))}
            </ScrollView>
          </View>
        );

      case "banner":
        return (
          <View
            style={{
              marginHorizontal: 20,
              marginTop: 12,
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: BORDER_INACTIVE,
              backgroundColor: CANVAS,
              paddingHorizontal: 16,
              paddingVertical: 13,
            }}
          >
            <Pressable onPress={() => router.push("/profile")} style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: INK }}>
                Answer four quick questions to see how each product suits your skin -&gt;
              </Text>
            </Pressable>
            <Pressable onPress={() => setBannerDismissed(true)} hitSlop={8}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: MUTED }}>&#x2715;</Text>
            </Pressable>
          </View>
        );

      case "skeleton":
        return <ProductRowSkeleton />;

      case "error":
        return (
          <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 32, paddingVertical: 96 }}>
            <Text style={{ textAlign: "center", fontSize: 13, color: MUTED }}>
              Couldn&apos;t load products. Check your connection and try again.
            </Text>
            <Pressable onPress={() => setRetryKey((k) => k + 1)}>
              <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
                Try again
              </Text>
            </Pressable>
          </View>
        );

      case "empty-catalog":
        return (
          <Text style={{ marginTop: 48, textAlign: "center", fontSize: 13, color: MUTED_FAINT }}>
            No products of this type yet.
          </Text>
        );

      case "empty-search":
        return (
          <View style={{ alignItems: "center", gap: 8, paddingHorizontal: 40, paddingTop: 80 }}>
            <Text style={{ textAlign: "center", fontFamily: "PlayfairDisplay_500Medium", fontSize: 18, color: INK }}>
              We don&apos;t have this product in our library yet.
            </Text>
            <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>
              Try the Scan tab to scan its barcode or ingredients instead.
            </Text>
            <PrimaryButton tone="cta" size={52} label="Go to Scan" onPress={() => router.push("/")} />
          </View>
        );

      case "product":
        return <ProductRow product={item.product} match={item.match} />;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS, paddingTop: insets.top }}>
      <FlatList
        data={items}
        keyExtractor={(item) => (item.kind === "skeleton" ? item.id : item.kind === "product" ? item.product.id : item.kind)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 112 }}
        // The search box lives in this same list's header, so with the
        // keyboard up, the default "never" meant a row's first tap only
        // dismissed the keyboard — the tap was consumed as "outside the
        // input" rather than reaching the row, so opening a result took two
        // taps. "handled" lets a tap that lands on an actual interactive
        // element (a row's Pressable) fire immediately; a tap on genuinely
        // empty list space still dismisses the keyboard as before.
        keyboardShouldPersistTaps="handled"
        // The type-filter row (index 1, once ListHeaderComponent claims index
        // 0) sticks while browsing; a search replaces the whole list below
        // the search box, so there's nothing of this screen's own to stick.
        stickyHeaderIndices={searchActive ? [] : [1]}
        ListHeaderComponent={
          <View style={{ gap: 18, paddingBottom: 8, backgroundColor: CANVAS }}>
            <AppHeader />

            {/* Scan, Saved and Profile used to repeat here as quick-action
                tiles — redundant once the tab bar already puts all three one
                tap away. The profile pill that used to sit in the header above
                is gone too (same reason: the Profile tab already covers "who
                am I browsing as"), so that's carried by the "Ranked for..." line
                below instead. */}
            <View style={{ paddingHorizontal: HEADER_GUTTER, gap: 10 }}>
              <View style={{ position: "relative", justifyContent: "center" }}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search products or brands"
                  placeholderTextColor={MUTED_FAINT}
                  autoCorrect={false}
                  style={{
                    height: 48,
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: BORDER_INACTIVE,
                    backgroundColor: CANVAS,
                    paddingHorizontal: 18,
                    // Room for the clear button once there's something to clear.
                    paddingRight: query.length > 0 ? 42 : 18,
                    fontSize: 13.5,
                    color: INK,
                  }}
                />
                {query.length > 0 && (
                  <Pressable
                    onPress={() => setQuery("")}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    style={{
                      position: "absolute",
                      right: 14,
                      width: 24,
                      height: 24,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                      <Path d="M6 6l12 12M18 6 6 18" stroke={MUTED} strokeWidth={2.2} strokeLinecap="round" />
                    </Svg>
                  </Pressable>
                )}
              </View>
              {!searchActive && (
                <Text style={{ fontSize: 11.5, color: MUTED }}>
                  {personalized
                    ? `Ranked for ${profileSummary(profile).toLowerCase()}`
                    : "No profile yet - showing unsorted results"}
                </Text>
              )}
            </View>
          </View>
        }
      />
    </View>
  );
}

/** Horizontal-scroll filter pill - same visual language as the ingredient
 *  tabs pills (components/IngredientTabsList.tsx), just this screen's own
 *  instance since it filters by product type, not by ingredient rung. */
function TypeChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={{
        height: TOUCH_TARGET,
        paddingHorizontal: 16,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: RADIUS_SELECTOR,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? TERRACOTTA : BORDER_INACTIVE,
        backgroundColor: selected ? SELECTED : CANVAS,
      }}
    >
      <Text style={{ fontSize: 13.5, fontWeight: "600", color: selected ? INK : MUTED }}>{label}</Text>
    </Pressable>
  );
}
