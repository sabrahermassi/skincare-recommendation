import { Image } from "expo-image";
import { Link, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, TextInput, View, type DimensionValue, type ListRenderItem } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HEADER_GUTTER } from "@/components/AppHeader";
import { GlassButton } from "@/components/GlassButton";
import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { ProductRow } from "@/components/ProductRow";
import { ProductRowSkeleton } from "@/components/ProductRowSkeleton";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { SaveHeart } from "@/components/SaveHeart";
import { ScorePill } from "@/components/ScorePill";
import { Text } from "@/components/Text";
import { fetchProductsByIds, longEnoughToSearch, peekProducts, searchableQuery, searchProducts, SEARCH_RESULT_LIMIT } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { matchProduct, type MatchResult } from "@/lib/matching";
import { isPersonalized } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { tabBarClearance } from "@/lib/tab-bar";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, MUTED_FAINT, SPACE, SURFACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";

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

// Before typing: the for.me line-up with "A little progress every day"
// (new-watercolor/forme_lineup_transparent.png, cropped to what's drawn). Drawn
// wider than the other empty-state pictures so its handwriting and labels read.
const WELCOME_ART = require("@/assets/illustrations/search-welcome.webp");
const WELCOME_ASPECT = 1000 / 1184;
const WELCOME_ART_WIDTH = "90%";
// A search with no match: the open box and magnifier, as the scanner's no-match sheet.
const NO_MATCH_ART = require("@/assets/illustrations/no-product-found.webp");
const NO_MATCH_ASPECT = 1164 / 697;

// Under the box while the query is too short to search (`longEnoughToSearch`).
const KEEP_TYPING = "Type at least three letters to search.";

// How many placeholder rows stand in for results on a cold search — enough to
// fill a phone screen without pretending to know the real count.
const SKELETON_ROWS = 6;

// One flat array for the FlatList, which can only virtualize a single list.
// The two empty states aren't rows: they're the list's empty component, so
// they can fill the room under the search box and sit centred in it.
type SearchItem =
  | { kind: "keep-typing" }
  | { kind: "recent-heading" }
  | { kind: "recent"; product: ProductWithIngredients; match: MatchResult }
  | { kind: "skeleton"; id: string }
  | { kind: "product"; product: ProductWithIngredients; match: MatchResult };

function skeletonRows(): SearchItem[] {
  return Array.from({ length: SKELETON_ROWS }, (_, i) => ({ kind: "skeleton", id: `skeleton-${i}` }));
}

export default function Browse() {
  const insets = useSafeAreaInsets();
  // `searchResults` is null until a query long enough to search has
  // actually been searched.
  const [query, setQuery] = useState("");
  const searchInput = useRef<TextInput>(null);
  const [searchResults, setSearchResults] = useState<ProductWithIngredients[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchActive = longEnoughToSearch(query);

  const profile = useAppStore((s) => s.profile);
  const personalized = isPersonalized(profile);
  const history = useAppStore((s) => s.history);
  const clearHistory = useAppStore((s) => s.clearHistory);

  // Search opens with the keyboard down, on its picture and what it is for
  // (owner, after OnSkin); a tap on the box brings the keyboard up. Leaving
  // blurs it, or iOS restores the focus on return and the keyboard covers the
  // tab bar (#296). Its own effect with no dependencies, so typing never
  // re-runs the cleanup and closes the keyboard (#309 review).
  const queryRef = useRef(query);
  const changeQuery = (next: string) => {
    queryRef.current = next;
    setQuery(next);
  };
  useFocusEffect(
    useCallback(() => {
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
      if (scoredSearch === null || scoredSearch.length === 0) return [];
      // Just the results: the skin questions live behind Home's "Find a
      // product" card, not above every search (owner).
      return scoredSearch.map(({ product, match }) => ({ kind: "product", product, match }) as const);
    }
    // Before typing: the watercolor still life (owner), then what was viewed
    // recently. Typed but too short to search: first say why nothing happens.
    // Once something has been viewed, the list takes the picture's place (owner).
    if (recent.length === 0) return [];
    return [
      ...(query.trim().length > 0 ? [{ kind: "keep-typing" } as const] : []),
      { kind: "recent-heading" },
      ...recent.map((product) => ({ kind: "recent", product, match: matchProduct(product, profile) }) as const),
    ];
  }, [searchActive, searching, scoredSearch, recent, profile, query]);

  const renderItem: ListRenderItem<SearchItem> = ({ item }) => {
    switch (item.kind) {
      case "keep-typing":
        return (
          <Text style={{ paddingHorizontal: HEADER_GUTTER, paddingBottom: SPACE.text, fontSize: TYPE.caption, color: MUTED }}>
            {KEEP_TYPING}
          </Text>
        );

      case "recent-heading":
        // "Clear all" empties the list at once, with no second tap (owner). It
        // clears the viewing history — the same log Saved's History shows —
        // and never the saved shelf.
        return (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: HEADER_GUTTER, paddingTop: SPACE.text }}>
            <Text accessibilityRole="header" style={{ fontSize: TYPE.title, fontWeight: "700", color: INK }}>
              Recently viewed
            </Text>
            <Pressable
              onPress={clearHistory}
              accessibilityRole="button"
              accessibilityLabel="Clear all recently viewed"
              hitSlop={SPACE.text}
              style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }}
              className="active:opacity-70"
            >
              <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: MUTED }}>Clear all</Text>
            </Pressable>
          </View>
        );

      case "skeleton":
        return <ProductRowSkeleton />;

      case "product":
        return <ProductRow product={item.product} match={item.match} />;

      case "recent":
        return <RecentRow product={item.product} match={item.match} />;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS, paddingTop: insets.top }}>
      <FlatList
        data={items}
        keyExtractor={(item) =>
          item.kind === "skeleton" ? item.id : item.kind === "product" || item.kind === "recent" ? `${item.kind}-${item.product.id}` : item.kind
        }
        renderItem={renderItem}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: tabBarClearance(insets.bottom) }}
        // Before typing with nothing viewed, or a search with no match: the
        // picture and its words, centred in the room under the search box
        // (owner). Typed but too short to search, it first says why.
        ListEmptyComponent={
          <View style={{ flex: 1 }}>
            {searchActive ? null : query.trim().length > 0 ? (
              <Text style={{ paddingHorizontal: HEADER_GUTTER, paddingBottom: SPACE.text, fontSize: TYPE.caption, color: MUTED }}>{KEEP_TYPING}</Text>
            ) : null}
            <View style={{ flex: 1, justifyContent: "center" }}>
              {searchActive ? (
                <EmptyState
                  art={NO_MATCH_ART}
                  aspect={NO_MATCH_ASPECT}
                  artLabel=""
                  title="We looked everywhere"
                  line="This product isn't in our library yet. Try searching for another one."
                />
              ) : (
                <EmptyState
                  art={WELCOME_ART}
                  aspect={WELCOME_ASPECT}
                  width={WELCOME_ART_WIDTH}
                  artLabel="A little progress every day"
                  title="Search by name or brand"
                  line="Look up any product in our library of analysed skincare."
                />
              )}
            </View>
          </View>
        }
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
                "Search" card), so this always leads home rather than
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
                <GlassButton
                  symbol="xmark"
                  icon="close"
                  accessibilityLabel="Clear search"
                  onPress={() => changeQuery("")}
                  small
                  style={{ position: "absolute", right: HEADER_GUTTER + 12 }}
                />
              )}
            </View>
          </View>
        }
      />
    </View>
  );
}

/**
 * What Search shows instead of results (owner, after OnSkin): a picture, a
 * heading and one line — before typing, and when nothing matched. No button:
 * the box above is the way forward.
 */
/**
 * One product under Recently viewed: its picture in a circle, name and brand,
 * the score and a heart to save it, with a hairline under each row. The heart
 * sits beside the link rather than inside it, so a tap on it never opens the
 * product.
 */
function RecentRow({ product, match }: { product: ProductWithIngredients; match: MatchResult }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: HEADER_GUTTER, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER_INACTIVE }}>
      <Link href={`/product/${product.id}`} asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${product.name}, ${product.brand}`}
          className="active:opacity-70"
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 }}
        >
          <ProductThumbnail product={product} size={RECENT_THUMB} radius={RECENT_THUMB / 2} backgroundColor={SURFACE} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text numberOfLines={2} style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>
              {product.name}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: TYPE.label, color: MUTED }}>
              {product.brand}
            </Text>
          </View>
          <ScorePill score={match.score} />
        </Pressable>
      </Link>
      <SaveHeart productId={product.id} fetchedAt={product.fetchedAt} />
    </View>
  );
}

// The round picture on a Recently viewed row.
const RECENT_THUMB = 56;

function EmptyState({
  art,
  aspect,
  width = EMPTY_ART_WIDTH,
  artLabel,
  title,
  line,
}: {
  art: number;
  aspect: number;
  width?: DimensionValue;
  artLabel: string;
  title: string;
  line: string;
}) {
  return (
    <View style={{ alignItems: "center", gap: SPACE.text, paddingHorizontal: HEADER_GUTTER }}>
      <Image source={art} contentFit="contain" accessibilityLabel={artLabel} style={{ width, aspectRatio: aspect }} />
      <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: "PlayfairDisplay_500Medium", fontSize: TYPE.heading, color: INK }}>
        {title}
      </Text>
      <Text style={{ textAlign: "center", fontSize: TYPE.body, lineHeight: TYPE.body * 1.4, color: MUTED }}>{line}</Text>
    </View>
  );
}

// How wide the empty-state picture is drawn: most of the screen, not all of it.
const EMPTY_ART_WIDTH = "72%";
