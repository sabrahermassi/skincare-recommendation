import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { IngredientTabsList, TABS, type Tab } from "@/components/IngredientTabsList";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { failureMessage, fetchProduct, peekProducts, type FetchFailure } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { relativeTime } from "@/lib/format";
import { matchProduct } from "@/lib/matching";
import { useAppStore } from "@/store/useAppStore";
import { CANVAS, INK, MUTED, TYPE } from "@/lib/tokens";

// The design system (design/DESIGN_SYSTEM.md).

/**
 * The full ingredient list — screen 3 of the for.me Screens design.
 *
 * Every row is judged against *this* profile, not in the abstract: the dot and
 * the pill say whether it works for you, which is the whole difference between
 * this and reading the back of the box.
 */

export default function IngredientList() {
  // `tab` arrives from the product screen's pore-clogging list, which deep
  // links straight into the filtered view rather than dropping you on "All"
  // to find them yourself.
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: string }>();
  // Seeded from the catalogue cache so a product already in memory paints on
  // the first frame instead of a spinner — same seam as `app/product/[id].tsx`.
  const [product, setProduct] = useState<ProductWithIngredients | null>(() =>
    peekProducts("all")?.find((p) => p.id === id) ?? null,
  );
  const [loading, setLoading] = useState(() => !product);
  // Set only when the catalogue could not be asked — distinct from
  // `product === null`, which is the catalogue answering it does not have
  // this id. Same split as `app/product/[id].tsx`; this screen used to fold
  // both into "Product not found", which told an outage it was a deletion
  // and offered no way back short of leaving the screen.
  const [failure, setFailure] = useState<FetchFailure | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  /**
   * Which id the product in state belongs to — same purpose as
   * `app/product/[id].tsx`'s own `loadedFor`. Seeded to `id` when `product`
   * itself was seeded from the cache above, so a failed background refetch
   * doesn't wipe out a product that was already correct on screen.
   */
  const loadedFor = useRef<string | null>(product ? id : null);

  const profile = useAppStore((s) => s.profile);

  useEffect(() => {
    let cancelled = false;
    // Skipped when `product` was already seeded from the cache for this
    // exact id — showing the spinner over content that's already correct is
    // the exact flash seeding was added to avoid. The fetch below still
    // runs, silently revalidating behind it.
    if (!(product && loadedFor.current === id)) setLoading(true);
    setFailure(null);
    fetchProduct(id)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setProduct(result.value);
          loadedFor.current = id;
        } else {
          // A failed retry of the id already on screen keeps that copy — it
          // beats an error page. A failed load of a *different* id must not
          // inherit it. Same split as `app/product/[id].tsx`'s `loadedFor`.
          if (loadedFor.current !== id) {
            setProduct(null);
            loadedFor.current = null;
          }
          setFailure(result.failure);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `product` is read deliberately, not as a dependency: it's checked only
    // to decide whether *this run* of the effect should show the spinner,
    // not to decide whether the effect re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, retryKey]);

  const match = useMemo(
    () => (product ? matchProduct(product, profile) : null),
    [product, profile]
  );
  // A stable fallback instant for the "label read ..." line below, for the
  // rare product with no fetchedAt — computed once per mount rather than
  // fresh on every render. react-hooks/purity flags Date.now() anywhere in
  // render, including inside useMemo; memoizing it is still the right call
  // (a ticking "now" would make the relative-time label drift on every
  // re-render), so this is a deliberate, narrow exception, not an oversight.
  // eslint-disable-next-line react-hooks/purity
  const now = useMemo(() => Date.now(), []);

  // `match` is null exactly when `product` is, so testing it here made the
  // not-found branch below unreachable: a deleted product, a malformed id or a
  // failed fetch all left the user on a spinner that never resolved. Loading
  // first, then the product, then anything derived from it.
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
        <ActivityIndicator color={INK} />
      </View>
    );
  }

  if (failure && !product) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS, paddingHorizontal: 32, gap: 16 }}>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 24, color: INK, textAlign: "center" }}>
          Couldn&apos;t load this product
        </Text>
        <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>
          {failureMessage(failure)}
        </Text>
        <PrimaryButton size={52} label="Try again" onPress={() => setRetryKey((k) => k + 1)} />
      </View>
    );
  }

  if (!product || !match) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS, paddingHorizontal: 32 }}>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 24, color: INK }}>
          Product not found
        </Text>
      </View>
    );
  }

  const total = product.ingredients.length;

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader title="Ingredients" />

      <IngredientTabsList
        ingredients={product.ingredients}
        match={match}
        initialTab={TABS.includes(initialTab as Tab) ? (initialTab as Tab) : "All"}
        metaLine={`${total} ingredient${total === 1 ? "" : "s"} · Tap for details`}
        subMetaLine={`Label read ${relativeTime(Date.parse(product.fetchedAt ?? "") || now)}`}
        onIngredientPress={(ingredient) =>
          router.push({
            pathname: "/ingredient/[inci]",
            params: { inci: ingredient.name, product: product.id },
          })
        }
      />

      {/* INCI order is regulated information, and it is the single fact that
          makes this list readable rather than just long. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          paddingHorizontal: 24,
          paddingBottom: 32,
          paddingTop: 16,
          backgroundColor: CANVAS,
        }}
      >
        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={9} stroke={MUTED} strokeWidth={1.8} />
          <Path
            d="M12 11v5.4M12 7.7v.1"
            stroke={MUTED}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </Svg>
        <Text style={{ fontSize: TYPE.caption, color: MUTED }}>
          Ingredients are listed in order of concentration.
        </Text>
      </View>
    </View>
  );
}
