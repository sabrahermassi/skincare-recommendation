import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { IngredientTabsList, TABS, type Tab } from "@/components/IngredientTabsList";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { failureMessage, fetchProduct, type FetchFailure } from "@/data/api";
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
  const [product, setProduct] = useState<ProductWithIngredients | null>(null);
  const [loading, setLoading] = useState(true);
  // Set only when the catalogue could not be asked — distinct from
  // `product === null`, which is the catalogue answering it does not have
  // this id. Same split as `app/product/[id].tsx`; this screen used to fold
  // both into "Product not found", which told an outage it was a deletion
  // and offered no way back short of leaving the screen.
  const [failure, setFailure] = useState<FetchFailure | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const profile = useAppStore((s) => s.profile);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailure(null);
    fetchProduct(id)
      .then((result) => {
        if (cancelled) return;
        // A failure clears the product for the same reason the old `catch`
        // did: without this, a failed request left the *previous* id's
        // product in state. `loading` gates the spinner so nothing renders it
        // mid-request, but the moment this resolves, the not-found branch
        // below is skipped and the prior product renders under the new
        // route's id — for a request that never actually answered for it.
        if (result.ok) {
          setProduct(result.value);
        } else {
          setProduct(null);
          setFailure(result.failure);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
        <PrimaryButton tone="cta" size={52} label="Try again" onPress={() => setRetryKey((k) => k + 1)} />
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
