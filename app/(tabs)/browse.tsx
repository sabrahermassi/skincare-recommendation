import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { AppHeader, HEADER_GUTTER } from "@/components/AppHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProductRow } from "@/components/ProductRow";
import { Text } from "@/components/Text";
import { fetchProducts, searchProducts } from "@/data/api";
import { PRODUCT_TYPE_LABEL, type ProductType, type ProductWithIngredients } from "@/data/types";
import { matchProduct } from "@/lib/matching";
import { isPersonalized, profileSummary } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, MUTED_FAINT, RADIUS_SELECTOR, SELECTED } from "@/lib/tokens";

// Manassa system (design/DESIGN_SYSTEM.md).

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

export default function Browse() {
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<ProductWithIngredients[] | null>(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [typeFilter, setTypeFilter] = useState<ProductType | "all">("all");
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
    setProducts(null);
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

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS, paddingTop: insets.top }}>
      {/* The type-filter row is only the second child (index 1) when it is
          actually rendered — it disappears entirely while a search is
          active, so there is nothing to stick in that case. */}
      <ScrollView contentContainerStyle={{ paddingBottom: 112 }} stickyHeaderIndices={searchActive ? [] : [1]}>
        <View style={{ gap: 18, paddingBottom: 8, backgroundColor: CANVAS }}>
          {/* The same masthead the scanner draws — same mark, same wordmark,
              same strapline, same size and colour. It used to be written out
              again here a few points smaller and in a different ink, so the
              top of the app resized itself as you moved between tabs. */}
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
                    <Path
                      d="M6 6l12 12M18 6 6 18"
                      stroke={MUTED}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                    />
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

        {/* Search replaces the type-filtered browse list entirely while
            active, the same way Search is its own mode on the Scan tab
            rather than a filter layered on top of Barcode. */}
        {!searchActive && (
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
        )}

        {!searchActive && !personalized && !bannerDismissed && (
          <View
            style={{
              marginHorizontal: 20,
              marginTop: 12,
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
        )}

        {searchActive ? (
          searching ? (
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 96 }}>
              <ActivityIndicator color={INK} />
            </View>
          ) : scoredSearch === null || scoredSearch.length === 0 ? (
            <View style={{ alignItems: "center", gap: 8, paddingHorizontal: 40, paddingTop: 80 }}>
              <Text style={{ textAlign: "center", fontFamily: "PlayfairDisplay_500Medium", fontSize: 18, color: INK }}>
                We don&apos;t have this product in our library yet.
              </Text>
              <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>
                Try the Scan tab to scan its barcode or ingredients instead.
              </Text>
              <PrimaryButton tone="cta" size={52} label="Go to Scan" onPress={() => router.push("/")} />
            </View>
          ) : (
            <View>
              {scoredSearch.map(({ product, match }) => (
                <ProductRow key={product.id} product={product} match={match} />
              ))}
            </View>
          )
        ) : error ? (
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
        ) : scored === null ? (
          <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 96 }}>
            <ActivityIndicator color={INK} />
          </View>
        ) : scored.length === 0 ? (
          <Text style={{ marginTop: 48, textAlign: "center", fontSize: 13, color: MUTED_FAINT }}>
            No products of this type yet.
          </Text>
        ) : (
          /*
            A list, not a grid. The grid could show a thumbnail and a price;
            this can show why a product ranks where it does, which is the
            question the app exists to answer.
          */
          <View>
            {scored.map(({ product, match }) => (
              <ProductRow key={product.id} product={product} match={match} />
            ))}
          </View>
        )}
      </ScrollView>
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
        height: 44,
        paddingHorizontal: 16,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: RADIUS_SELECTOR,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? INK : BORDER_INACTIVE,
        backgroundColor: selected ? SELECTED : CANVAS,
      }}
    >
      <Text style={{ fontSize: 13.5, fontWeight: "600", color: selected ? INK : MUTED }}>
        {label}
      </Text>
    </Pressable>
  );
}
