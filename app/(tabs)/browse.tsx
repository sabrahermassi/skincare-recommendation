import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Chip } from "@/components/Chip";
import { AppHeader, HEADER_GUTTER, ProfilePill } from "@/components/AppHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProductRow } from "@/components/ProductRow";
import { Text } from "@/components/Text";
import { fetchProducts, searchProducts } from "@/data/api";
import type { ProductType, ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { matchProduct } from "@/lib/matching";
import { isPersonalized, profileSummary } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

const FACE_TYPE_FILTERS: (ProductType | "all")[] = [
  "all",
  "serum",
  "ampoule",
  "moisturizer",
  "sunscreen",
  "cleanser",
];

const BODY_TYPE_FILTERS: (ProductType | "all")[] = [
  "all",
  "body-wash",
  "body-lotion",
  "hand-cream",
];

const TYPE_LABEL: Record<ProductType | "all", string> = {
  all: "All",
  cleanser: "Cleanser",
  toner: "Toner",
  essence: "Essence",
  serum: "Serum",
  ampoule: "Ampoule",
  moisturizer: "Moisturizer",
  sunscreen: "Sunscreen",
  "body-wash": "Body wash",
  "body-lotion": "Body lotion",
  "hand-cream": "Hand cream",
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
  const compareIds = useAppStore((s) => s.compareIds);

  const area = profile.area ?? undefined;
  const typeFilters = profile.area === "body" ? BODY_TYPE_FILTERS : FACE_TYPE_FILTERS;
  const personalized = isPersonalized(profile);

  useEffect(() => {
    let cancelled = false;
    setProducts(null);
    setError(false);
    fetchProducts({ type: typeFilter, area })
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
  }, [typeFilter, area, retryKey]);

  // The type-filter chip bar is area-specific (face vs body types), so a
  // stale face filter must not linger over the body list after an edit.
  useEffect(() => {
    setTypeFilter("all");
  }, [profile.area]);

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
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* The type-filter row is only the second child (index 1) when it is
          actually rendered — it disappears entirely while a search is
          active, so there is nothing to stick in that case. */}
      <ScrollView contentContainerClassName="pb-28" stickyHeaderIndices={searchActive ? [] : [1]}>
        <View style={{ gap: 18, paddingBottom: 8 }}>
          {/* The same masthead the scanner draws — same mark, same wordmark,
              same strapline, same size and colour. It used to be written out
              again here a few points smaller and in a different ink, so the
              top of the app resized itself as you moved between tabs. */}
          <AppHeader right={<ProfilePill summary={profileSummary(profile)} />} />

          {/* Scan, Saved and Profile used to repeat here as quick-action
              tiles — redundant once the tab bar already puts all three one
              tap away, and the profile chip in the header above covers
              "who am I browsing as" on its own. */}
          <View style={{ paddingHorizontal: HEADER_GUTTER, gap: 10 }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search products or brands"
              placeholderTextColor={COLORS.inkFaint}
              autoCorrect={false}
              className="rounded-control border border-hairline bg-surface px-4 py-3 text-[13px] text-ink"
            />
            {!searchActive && (
              <Text className="text-[11.5px] text-ink-muted">
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
          <View style={{ paddingBottom: 16 }} className="bg-canvas">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: HEADER_GUTTER, paddingTop: 10 }}
            >
              {typeFilters.map((type) => (
                <Chip
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
          <View className="mx-5 mt-3 flex-row items-center gap-2 rounded-card bg-tint-lilac px-4 py-3">
            <Pressable onPress={() => router.push("/profile")} className="flex-1">
              <Text className="text-sm font-semibold text-accent-text">
                Answer three quick questions to see how each product suits your skin →
              </Text>
            </Pressable>
            <Pressable onPress={() => setBannerDismissed(true)} hitSlop={8}>
              <Text className="text-sm font-semibold text-accent-text">✕</Text>
            </Pressable>
          </View>
        )}

        {searchActive ? (
          searching ? (
            <View className="items-center justify-center py-24">
              <ActivityIndicator color={COLORS.accent} />
            </View>
          ) : scoredSearch === null || scoredSearch.length === 0 ? (
            <View className="items-center gap-2 px-10 pt-20">
              <Text className="text-center font-display text-lg text-ink">
                We don&apos;t have this product in our library yet.
              </Text>
              <Text className="text-center text-[13px] leading-[19px] text-ink-muted">
                Try the Scan tab to scan its barcode or ingredients instead.
              </Text>
              <PrimaryButton label="Go to Scan" onPress={() => router.push("/")} />
            </View>
          ) : (
            <View>
              {scoredSearch.map(({ product, match }) => (
                <ProductRow key={product.id} product={product} match={match} />
              ))}
            </View>
          )
        ) : error ? (
          <View className="items-center gap-3 px-8 py-24">
            <Text className="text-center text-ink-faint">
              Couldn&apos;t load products. Check your connection and try again.
            </Text>
            <Pressable onPress={() => setRetryKey((k) => k + 1)}>
              <Text className="text-sm font-semibold text-accent-text underline">Try again</Text>
            </Pressable>
          </View>
        ) : scored === null ? (
          <View className="items-center justify-center py-24">
            <ActivityIndicator color={COLORS.accent} />
          </View>
        ) : scored.length === 0 ? (
          <Text className="mt-12 text-center text-ink-faint">No products of this type yet.</Text>
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

      {/* Compare tray — only appears once something is selected. */}
      {compareIds.length > 0 && (
        <View className="absolute inset-x-0 bottom-0 border-t border-hairline bg-surface p-4">
          <PrimaryButton
            label={`Compare ${compareIds.length} selected${
              compareIds.length === 1 ? " - pick one more" : ""
            }`}
            onPress={() => router.push("/compare")}
          />
        </View>
      )}
    </View>
  );
}
