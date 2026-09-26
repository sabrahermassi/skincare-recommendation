import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, TextInput, View, type ListRenderItem } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { HEADER_GUTTER } from "@/components/AppHeader";
import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProductRow } from "@/components/ProductRow";
import { ProductRowSkeleton } from "@/components/ProductRowSkeleton";
import { SkinMatchCard } from "@/components/SkinMatchCard";
import { openScanner } from "@/lib/open-scanner";
import { Text } from "@/components/Text";
import { fetchProductsByIds, peekProducts, searchableQuery, searchProducts, SEARCH_RESULT_LIMIT } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { matchProduct, type MatchResult } from "@/lib/matching";
import { isPersonalized } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { tabBarClearance } from "@/lib/tab-bar";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, MUTED_FAINT, SPACE, TYPE } from "@/lib/tokens";

/**
 * Search (#317): search first, no catalogue list. Someone in a shop is
 * holding one product and wants to know about that one, so the screen opens on
 * the search box with the keyboard up, the products they looked at last, and
 * the scanner. Results appear only once they type, ranked for their skin.
 *
 * It used to open on the whole catalogue, scored and ranked, which made a
 * mostly Western catalogue look empty to someone shopping in Korea and made
 * this the slowest screen in the app.
 */

// Enough to find the one they just put down, without turning into a list.
const RECENT_LIMIT = 8;

// One empty list, so "nothing recent yet" is the same value every render.
const NO_PRODUCTS: ProductWithIngredients[] = [];

// How many placeholder rows stand in for results on a cold search — enough to
// fill a phone screen without pretending to know the real count.
const SKELETON_ROWS = 6;

// One flat array for the FlatList, which can only virtualize a single list.
type SearchItem =
  | { kind: "scan" }
  | { kind: "skin-match" }
  | { kind: "recent-heading" }
  | { kind: "skeleton"; id: string }
  | { kind: "empty-search" }
  | { kind: "product"; product: ProductWithIngredients; match: MatchResult };

function skeletonRows(): SearchItem[] {
  return Array.from({ length: SKELETON_ROWS }, (_, i) => ({ kind: "skeleton", id: `skeleton-${i}` }));
}

export default function Browse() {
  const insets = useSafeAreaInsets();
  // `searchResults` is null until a query of at least 2 characters has
  // actually been searched.
  const [query, setQuery] = useState("");
  const searchInput = useRef<TextInput>(null);
  const [searchResults, setSearchResults] = useState<ProductWithIngredients[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchActive = query.trim().length >= 2;

  const profile = useAppStore((s) => s.profile);
  const personalized = isPersonalized(profile);
  const history = useAppStore((s) => s.history);

  // The box is focused, keyboard up, each time the tab opens on an empty
  // search. Not when coming back to results: the keyboard would cover them.
  // Leaving blurs it, or iOS restores the focus on return and the keyboard
  // covers the tab bar (#296). Its own effect with no dependencies, so typing
  // never re-runs the cleanup and closes the keyboard (#309 review).
  const queryRef = useRef(query);
  const changeQuery = (next: string) => {
    queryRef.current = next;
    setQuery(next);
  };
  useFocusEffect(
    useCallback(() => {
      if (queryRef.current === "") searchInput.current?.focus();
      return () => searchInput.current?.blur();
    }, []),
  );

  // "Search by name" from the scanner (#323) arrives as a one-time `byName`:
  // the box starts empty, whatever was searched before, and takes the focus.
  // Cleared while rendering, as React recommends for state that follows a
  // prop; only the focus, which is not state, waits for an effect.
  const { byName } = useLocalSearchParams<{ byName?: string }>();
  const [handledByName, setHandledByName] = useState(byName);
  if (byName !== handledByName) {
    setHandledByName(byName);
    if (byName) setQuery("");
  }
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  useEffect(() => {
    if (byName) searchInput.current?.focus();
  }, [byName]);

  // Recently viewed: the newest catalogue products in the history log, newest
  // first. Unrecognised barcodes are in the log too, but there is nothing to
  // open for them here.
  const recentIds = useMemo(
    () => history.filter((entry) => entry.known).slice(0, RECENT_LIMIT).map((entry) => entry.id),
    [history],
  );
  // Paired with the ids it was read for, so a changed history never shows the
  // previous list under it — detected here rather than cleared by an effect.
  const [recentState, setRecentState] = useState<{ ids: string[]; products: ProductWithIngredients[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchProductsByIds(recentIds).then((result) => {
      if (cancelled || !result.ok) return;
      const byId = new Map(result.value.map((product) => [product.id, product]));
      setRecentState({
        ids: recentIds,
        products: recentIds.flatMap((id) => byId.get(id) ?? []),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [recentIds]);
  const recent = recentState?.ids === recentIds ? recentState.products : NO_PRODUCTS;

  // Narrow the cached catalogue on every keystroke, with no network and no
  // wait. `peekProducts` is synchronous and already holds the whole
  // catalogue (it is what the splash warms), so the answer is normally
  // already on the device — the debounced server search below only has to
  // catch what the cache is missing. Null means "no cache to search", which
  // is the one case that still has to wait.
  //
  // Capped at `SEARCH_RESULT_LIMIT`, the same number the server applies: the
  // two answers replace each other, so a wider local list would visibly
  // shrink when the narrower server one landed. The cap also bounds the
  // scoring below, which runs over these rows on every keystroke.
  const localMatches = useMemo(() => {
    if (!searchActive) return null;
    const cached = peekProducts("all");
    if (!cached) return null;
    // The same cleaning the server search applies, so "%%" or "--" match
    // nothing here either (#297).
    const needle = searchableQuery(query)?.toLowerCase();
    if (!needle) return [];
    const hits: ProductWithIngredients[] = [];
    for (const product of cached) {
      if (
        product.name.toLowerCase().includes(needle) ||
        product.brand.toLowerCase().includes(needle)
      ) {
        hits.push(product);
        if (hits.length === SEARCH_RESULT_LIMIT) break;
      }
    }
    return hits;
  }, [query, searchActive]);

  // Debounced: a query per keystroke would hammer the backend for nothing.
  useEffect(() => {
    if (!searchActive) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    // The previous query's server results do not describe this one, so they
    // go immediately — `localMatches` covers the gap. Skeletons are only for
    // a genuinely cold search, where there is no cache to fall back on;
    // showing them on every keystroke is what made typing feel like it
    // blanked the list and then thought about it for a second.
    setSearchResults(null);
    setSearching(localMatches === null);
    const timer = setTimeout(() => {
      searchProducts(query)
        .then((found) => {
          if (!cancelled) setSearchResults(found);
        })
        .catch((err) => {
          console.warn("searchProducts failed:", err);
          if (cancelled) return;
          // A failed request is not an empty catalogue. `effectiveResults`
          // below reads `searchResults ?? localMatches`, so writing `[]` here
          // made the failure authoritative: with a warm cache and no network,
          // matches that were already on screen were replaced by "not in our
          // library" — the one answer we know to be wrong. Leaving it null
          // lets the local narrowing stand. Only with no cache to fall back on
          // does an empty list mean what it says.
          setSearchResults(localMatches === null ? [] : null);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchActive, localMatches]);

  // Server results win once they land; until then the local narrowing is
  // what the list shows, so each keystroke visibly shrinks the results
  // instead of clearing them.
  const effectiveResults = searchResults ?? localMatches;

  const scoredSearch = useMemo(() => {
    if (!effectiveResults) return null;
    const withScores = effectiveResults.map((product) => ({
      product,
      match: matchProduct(product, profile),
    }));
    if (!personalized) return withScores;
    return [...withScores].sort((a, b) => (b.match.score ?? 0) - (a.match.score ?? 0));
  }, [effectiveResults, profile, personalized]);

  const items = useMemo<SearchItem[]>(() => {
    if (searchActive) {
      if (searching) return skeletonRows();
      if (scoredSearch === null || scoredSearch.length === 0) return [{ kind: "empty-search" }];
      const rows = scoredSearch.map(({ product, match }) => ({ kind: "product", product, match }) as const);
      // Results with no scores yet: the questions that would score them (#346).
      return personalized ? rows : [{ kind: "skin-match" }, ...rows];
    }
    // Before typing. The scanner first: with the keyboard up, it is the one
    // thing sure to be above it.
    const list: SearchItem[] = [{ kind: "scan" }];
    if (recent.length > 0) {
      list.push(
        { kind: "recent-heading" },
        ...recent.map((product) => ({ kind: "product", product, match: matchProduct(product, profile) }) as const),
      );
    }
    return list;
  }, [searchActive, searching, scoredSearch, recent, profile, personalized]);

  const renderItem: ListRenderItem<SearchItem> = ({ item }) => {
    switch (item.kind) {
      case "scan":
        return (
          <View style={{ paddingHorizontal: HEADER_GUTTER, paddingBottom: SPACE.block }}>
            <PrimaryButton variant="gray" size={48} label="Scan a product instead" onPress={openScanner} />
          </View>
        );

      case "skin-match":
        return (
          <View style={{ paddingHorizontal: HEADER_GUTTER, paddingBottom: SPACE.block }}>
            <SkinMatchCard />
          </View>
        );

      case "recent-heading":
        return (
          <Text
            accessibilityRole="header"
            style={{ paddingHorizontal: HEADER_GUTTER, paddingTop: SPACE.text, paddingBottom: SPACE.text, fontSize: TYPE.label, fontWeight: "600", color: MUTED }}
          >
            Recently viewed
          </Text>
        );

      case "skeleton":
        return <ProductRowSkeleton />;

      case "empty-search":
        return (
          <View style={{ alignItems: "center", gap: 8, paddingHorizontal: 40, paddingTop: 80 }}>
            <Text style={{ textAlign: "center", fontFamily: "PlayfairDisplay_500Medium", fontSize: 18, color: INK }}>
              We don&apos;t have this product in our library yet.
            </Text>
            <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>
              Try the Scan tab to scan its barcode or ingredients instead.
            </Text>
            <PrimaryButton size={52} label="Go to Scan" onPress={openScanner} />
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
        contentContainerStyle={{ paddingBottom: tabBarClearance(insets.bottom) }}
        // The search box lives in this same list's header, so with the
        // keyboard up, the default "never" meant a row's first tap only
        // dismissed the keyboard — the tap was consumed as "outside the
        // input" rather than reaching the row, so opening a result took two
        // taps. "handled" lets a tap that lands on an actual interactive
        // element (a row's Pressable) fire immediately; a tap on genuinely
        // empty list space still dismisses the keyboard as before.
        keyboardShouldPersistTaps="handled"
        // The tab opens with the keyboard up; scrolling the list puts it away.
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={{ gap: 18, paddingBottom: SPACE.block, backgroundColor: CANVAS }}>
            {/* Back to Home. Browse has no tab of its own (it opens from Home's
                "Find skincare" card), so this always leads home rather than
                back through wherever the search was opened from. */}
            <View style={{ flexDirection: "row", paddingHorizontal: HEADER_GUTTER, paddingTop: 12, paddingBottom: 14 }}>
              <Pressable
                onPress={() => router.navigate("/")}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel="Back to Home"
                className="active:opacity-70"
              >
                <ArrowIcon direction="left" size={24} color={INK} />
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: HEADER_GUTTER, position: "relative", justifyContent: "center" }}>
              <TextInput
                ref={searchInput}
                value={query}
                onChangeText={changeQuery}
                placeholder="Search products or brands"
                placeholderTextColor={MUTED_FAINT}
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Search products or brands"
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
                  onPress={() => changeQuery("")}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  style={{
                    position: "absolute",
                    right: HEADER_GUTTER + 14,
                    width: 24,
                    height: 24,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  className="active:opacity-70"
                >
                  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                    <Path d="M6 6l12 12M18 6 6 18" stroke={MUTED} strokeWidth={2.2} strokeLinecap="round" />
                  </Svg>
                </Pressable>
              )}
            </View>
          </View>
        }
      />
    </View>
  );
}
