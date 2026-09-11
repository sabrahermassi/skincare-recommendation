import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { CopyIcon } from "@/components/CopyIcon";
import { IngredientTabsList, TABS, type Tab } from "@/components/IngredientTabsList";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { fetchProduct } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { relativeTime } from "@/lib/format";
import { matchProduct } from "@/lib/matching";
import { useAppStore } from "@/store/useAppStore";
import { CANVAS, INK, MUTED } from "@/lib/tokens";

// Manassa system (design/DESIGN_SYSTEM.md).

/**
 * The full ingredient list — screen 3 of the Manassa Screens design.
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
  const [copied, setCopied] = useState(false);

  const profile = useAppStore((s) => s.profile);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProduct(id)
      .then((result) => {
        if (cancelled) return;
        setProduct(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("fetchProduct failed:", err);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

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

  if (loading || !match) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
        <ActivityIndicator color={INK} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS, paddingHorizontal: 32 }}>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 24, color: INK }}>
          Product not found
        </Text>
      </View>
    );
  }

  const total = product.ingredients.length;

  // Plain, comma-separated names in label order — the format someone would
  // paste straight into a second app to compare by hand, which is the actual
  // point: this app's own verdict is one tap away already, so the only reason
  // to copy the list is to check it against something else.
  async function copyList() {
    if (!product || product.ingredients.length === 0) return;
    await Clipboard.setStringAsync(product.ingredients.map((i) => i.name).join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader
        title="Ingredients"
        right={
          total > 0 ? (
            <Pressable
              onPress={copyList}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={copied ? "Ingredient list copied" : "Copy ingredient list"}
            >
              <CopyIcon copied={copied} />
            </Pressable>
          ) : undefined
        }
      />

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
        <Text style={{ fontSize: 10.5, color: MUTED }}>
          Ingredients are listed in order of concentration.
        </Text>
      </View>
    </View>
  );
}
