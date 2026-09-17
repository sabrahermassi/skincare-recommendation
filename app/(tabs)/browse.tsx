import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, TextInput, View, type ListRenderItem } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { AppHeader, HEADER_GUTTER } from "@/components/AppHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProductRow } from "@/components/ProductRow";
import { ProductRowSkeleton } from "@/components/ProductRowSkeleton";
import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
// One selected-outline color app-wide — see profile.tsx's own note on why
// this FOR.ME shell token is reused outside its original scope.
import { TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import { fetchProducts, peekProducts, searchProducts, SEARCH_RESULT_LIMIT } from "@/data/api";
import { PRODUCT_TYPE_LABEL, type ProductType, type ProductWithIngredients, type SkinProfile } from "@/data/types";
import { matchProduct, type MatchResult } from "@/lib/matching";
import { isPersonalized, profileSummary } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, MUTED_FAINT, RADIUS_SELECTOR, SELECTED, TOUCH_TARGET, TYPE } from "@/lib/tokens";

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
  "eye-cream",
  "facial-oil",
  "night-mask",
  "exfoliator",
  "lip-balm",
  "facial-mist",
  "sheet-mask",
];

/*
  Face families only, deliberately. `scripts/import-obf.mjs` fetches six
  skincare categories (en:face, en:suncare, en:cleansers, en:skin-care,
  en:creams, en:moisturizers), and that filter is itself a measured decision:
  a broader sweep returned 352 unscoreable rows out of 549, toothpaste and
  dish soap included. So shampoo, conditioner, hair-oil, hair-mask,
  deodorant, perfume, body-butter, body-scrub and foot-cream are real
  `ProductType`s a live scan can still produce, but the catalogue holds
  almost none of them — a chip for each would open an empty list.

  They keep their type, label and illustration; they just don't get a filter
  chip until there is something behind one. The durable version is building
  the chips from `fetchProductTypes()` (data/api.ts) instead of a hand-kept
  list, which would also cover the body-wash/body-lotion/hand-cream chips
  that predate this one.
*/

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

/**
 * How many scored rows are revealed at once, and how many more each time the
 * list reaches its end.
 *
 * `FlatList` already virtualizes what it *draws*, so this is not about draw
 * cost — it bounds the `BrowseItem` array this screen builds and re-builds on
 * every filter change and every profile edit. At 5,000 products that array was
 * rebuilt whole to show the forty rows a phone can scroll to.
 */
const BROWSE_PAGE_SIZE = 40;

/**
 * How many products are scored before yielding back to the UI thread.
 *
 * Ranking is global — the header promises "Ranked for…", and that is only true
 * if every product was scored before sorting — so the pass cannot be shortened,
 * only broken up. Measured cost of one pass, on a dev machine and so optimistic
 * for a phone:
 *
 *     153 products    85ms      1,000 products    520ms
 *     647 products   218ms      5,000 products  1,572ms
 *
 * Run synchronously in a `useMemo`, that is a frozen screen for a second and a
 * half at the size step 7 is aiming for. Chunked, each hop is ~120ms and the
 * thread stays live between them.
 *
 * The second pass is ~1ms at every size, because `matchProduct` caches (6b-2),
 * so this only ever costs anything the first time a profile meets a catalogue.
 */
const SCORE_CHUNK = 400;

type ScoredProduct = { product: ProductWithIngredients; match: MatchResult };

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
  /**
   * How far down the ranked list the user has scrolled, tied to the exact rows
   * it counts into.
   *
   * Paired with the products and profile it was counted against, rather than
   * reset by an effect: those two are what a ranking is made of, so comparing
   * identity means the count falls back to the first page on its own. An effect
   * would do the same thing a render later — and would be a `setState` inside
   * an effect, which is the cascade this screen's other effects already get
   * warned about.
   *
   * It holds those two rather than the scored rows for a reason worth keeping:
   * the catalogue and the store already own them, so nothing is kept alive that
   * would otherwise be collected. Holding the rows array meant the *previous*
   * filter's fully scored list — every product plus every verdict — stayed
   * reachable from here until the next scroll, which is precisely the kind of
   * retention step 6b-4 exists to remove.
   */
  const [page, setPage] = useState<{
    source: ProductWithIngredients[] | null;
    profile: SkinProfile | null;
    count: number;
  }>({ source: null, profile: null, count: BROWSE_PAGE_SIZE });

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

  // Re-read the cache whenever this tab comes back.
  //
  // The catalogue lives in a module, and this screen keeps its own copy in
  // state. A product contributed mid-session — a scan, a label read — replaces
  // the module's entry, and an already-mounted Browse has no way to hear about
  // it: the effect above only runs again on a filter change or a retry. So the
  // product the user just added was missing from the list until they touched a
  // chip or reloaded.
  //
  // `peekProducts` is synchronous, hits no network, and hands back the *same
  // array instance* when nothing has changed, so an ordinary tab switch sets
  // state to the value it already holds and React renders nothing. Null means
  // there is no cache to read, which is not the same as an empty catalogue —
  // leave what is on screen and let the effect above do the fetching.
  useFocusEffect(
    useCallback(() => {
      const cached = peekProducts(typeFilter);
      if (cached) setProducts(cached);
    }, [typeFilter]),
  );

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
    const needle = query.trim().toLowerCase();
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

  // Debounced the same way the Scan tab's Search pane is: a query per
  // keystroke would hammer the backend for nothing.
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

  /**
   * The scored list, and the exact products array it was built from.
   *
   * Carrying the source array is what lets a stale result be *detected* rather
   * than guarded against by clearing state up front. Clearing would flash
   * skeletons on every filter tap even when the scores are already cached and
   * the pass takes a millisecond; keeping the old rows on screen would show
   * one filter's products under another's chip. Comparing identity does
   * neither: a tab switch hands back the same array (the catalogue cache
   * returns stable references, which is the whole reason it does) and nothing
   * re-renders, while a filter change is a different array and the skeletons
   * are correct for exactly as long as the scoring takes.
   */
  const [scoredState, setScoredState] = useState<{
    source: ProductWithIngredients[];
    /**
     * The profile these scores were computed against, and not a formality.
     * Editing the profile leaves `source` untouched — it is the same catalogue
     * — so without this the stale check would pass and Browse would keep
     * showing rows scored against the *previous* answers until the new pass
     * finished. A stale ranking is the one kind of wrong this screen cannot
     * afford to show silently, since a wrong number looks exactly like a right
     * one.
     */
    profile: SkinProfile;
    rows: ScoredProduct[];
  } | null>(null);

  // A layout effect, not a passive one: a passive effect only runs after the
  // render it belongs to has already committed and painted, so the first
  // chunk being computed "synchronously" inside it still meant a commit with
  // `scoredState` still null landed on screen first — a skeleton flash on
  // every mount and filter change, cached scores or not. A layout effect
  // runs before that paint, which is what actually makes the first chunk
  // synchronous from the screen's point of view, and is what lets a
  // catalogue at or below `SCORE_CHUNK` — every catalogue this app has
  // shipped with so far — settle in the same frame the `useMemo` this
  // replaced did. Only the first chunk is inside that synchronous window;
  // `setTimeout` still defers everything after it to its own macrotask, so a
  // catalogue larger than one chunk still paints skeletons and fills in.
  useLayoutEffect(() => {
    if (!products) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const rows: ScoredProduct[] = [];
    let i = 0;

    const step = () => {
      if (cancelled) return;
      const end = Math.min(i + SCORE_CHUNK, products.length);
      for (; i < end; i += 1) {
        rows.push({ product: products[i], match: matchProduct(products[i], profile) });
      }
      if (i < products.length) {
        timer = setTimeout(step, 0);
        return;
      }
      // Sorting by score only makes sense once there's a score to sort by —
      // otherwise it silently reorders the catalogue for no reason. It also
      // has to happen here, after every product is scored: sorting a partial
      // list would put the best of the first chunk above a better match that
      // had not been reached yet, which is the one thing ranking must not do.
      setScoredState({
        source: products,
        profile,
        rows: personalized
          ? [...rows].sort((a, b) => (b.match.score ?? 0) - (a.match.score ?? 0))
          : rows,
      });
    };

    step();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [products, profile, personalized]);

  const scored =
    scoredState && scoredState.source === products && scoredState.profile === profile
      ? scoredState.rows
      : null;
  const visibleCount =
    page.source === products && page.profile === profile ? page.count : BROWSE_PAGE_SIZE;

  // The list is being ranked right now: there are products to score and no
  // finished ranking for them yet. Distinct from having no products at all,
  // which is the cold-fetch skeleton, and from `error`.
  const ranking = products !== null && scored === null && !error;

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
      // Sliced, not filtered: `scored` is already in final rank order, so the
      // first `visibleCount` really are the best matches rather than the first
      // ones to be scored.
      list.push(
        ...scored
          .slice(0, visibleCount)
          .map(({ product, match }) => ({ kind: "product", product, match }) as const),
      );
    }
    return list;
  }, [searchActive, searching, scoredSearch, error, scored, personalized, bannerDismissed, visibleCount]);

  // Search results are capped at `SEARCH_RESULT_LIMIT`, well under one page,
  // so paging applies to the browse list only.
  const canLoadMore = !searchActive && scored !== null && visibleCount < scored.length;

  /**
   * What a screen reader hears when the list changes state.
   *
   * Sighted users get the skeletons, then rows. Before this, a screen reader
   * got nothing at all: ranking is now asynchronous, so editing the profile or
   * tapping a filter chip left a blind user with silence and no way to tell
   * whether the list was rebuilding, empty, or broken. The component is already
   * used by the scanner for exactly this reason, and carries the notes on why
   * `accessibilityLiveRegion` alone does not cover all three platforms.
   *
   * Search is excluded: that list has its own flow and announcing both would
   * talk over the results as the user types.
   */
  const announcement = searchActive
    ? ""
    : error
      ? "Couldn't load products."
      : ranking
        ? personalized
          ? "Ranking products for your skin."
          : "Loading products."
        : scored
          ? `${scored.length} ${scored.length === 1 ? "product" : "products"}${
              personalized ? ", ranked for your skin" : ""
            }.`
          : "";

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
      <ScreenReaderAnnouncer message={announcement} />
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
        // Infinite scroll rather than a "Load more" button: the next page is
        // already scored and in memory, so there is nothing to wait for and a
        // button would only add a tap between the user and rows that are
        // ready. No footer spinner for the same reason — it would flash for a
        // frame and say nothing.
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (!canLoadMore) return;
          setPage({ source: products, profile, count: visibleCount + BROWSE_PAGE_SIZE });
        }}
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
                <Text style={{ fontSize: TYPE.caption, color: MUTED }}>
                  {/* Past tense only once it is true. Editing the profile
                      re-ranks the whole catalogue, and this line used to claim
                      the new ranking immediately while the list underneath was
                      still skeletons — promising an order that did not exist
                      yet, for as long as the scoring took. */}
                  {personalized
                    ? ranking
                      ? `Ranking for ${profileSummary(profile).toLowerCase()}…`
                      : `Ranked for ${profileSummary(profile).toLowerCase()}`
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
