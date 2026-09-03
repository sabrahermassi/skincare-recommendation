import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";

import { BottleIcon } from "@/components/BottleIcon";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SafetyPill } from "@/components/SafetyPill";
import { fetchProductsByIds } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { matchProduct, matchTone } from "@/lib/matching";
import { flaggedIngredients } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

/** Match colour follows the same three bands as every other score in the app. */
const TONE_TEXT = {
  high: "text-status-safe",
  medium: "text-status-caution",
  low: "text-status-watch",
} as const;

export default function Compare() {
  const insets = useSafeAreaInsets();
  const compareIds = useAppStore((s) => s.compareIds);
  const clearCompare = useAppStore((s) => s.clearCompare);
  const profile = useAppStore((s) => s.profile);

  const [products, setProducts] = useState<ProductWithIngredients[] | null>(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setProducts(null);
    setError(false);
    fetchProductsByIds(compareIds)
      .then((result) => {
        if (!cancelled) setProducts(result);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("fetchProductsByIds failed:", err);
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [compareIds, retryKey]);

  const header = (
    <View className="flex-row items-center justify-between px-5" style={{ paddingTop: insets.top + 8 }}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
        <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
          <Path
            d="m15 5-7 7 7 7"
            stroke={COLORS.ink}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
      <Text className="text-base font-semibold text-ink">Compare</Text>
      <View style={{ width: 21 }} />
    </View>
  );

  if (compareIds.length === 0) {
    return (
      <View className="flex-1 bg-canvas">
        {header}
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="text-center text-base text-ink-muted">
            Nothing selected yet. Add two products from a product page.
          </Text>
          <Link href="/" className="font-semibold text-accent-text underline">
            Back to browse
          </Link>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-canvas">
        {header}
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="text-center text-base text-ink-muted">
            Couldn&apos;t load these products. Check your connection and try again.
          </Text>
          <Pressable onPress={() => setRetryKey((k) => k + 1)}>
            <Text className="font-semibold text-accent-text underline">Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (products === null) {
    return (
      <View className="flex-1 bg-canvas">
        {header}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={COLORS.accent} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      {header}

      <ScrollView contentContainerClassName="px-4 pb-8 pt-5">
        {compareIds.length === 1 && (
          <Text className="mb-3 rounded-chip bg-tint-peach p-3 text-xs text-ink">
            Pick one more product to see a side-by-side.
          </Text>
        )}

        {/* Two fixed columns, so the comparison reads top-to-bottom in pairs. */}
        <View className="flex-row items-start gap-3">
          {products.map((product) => {
            const { score } = matchProduct(product, profile);
            const flaggedCount = flaggedIngredients(product.ingredients).length;
            const tone = score === null ? null : matchTone(score);

            return (
              <View key={product.id} className="flex-1 rounded-card bg-surface p-3.5 shadow-md">
                <BottleIcon type={product.productType} size={44} />
                <Text className="pt-3 text-[9.5px] font-semibold uppercase tracking-[0.7px] text-ink-faint">
                  {product.brand}
                </Text>
                <Text className="pt-1 text-[13px] font-semibold leading-[17px] text-ink" numberOfLines={3}>
                  {product.name}
                </Text>

                {/*
                  Size, not price. The design takes prices out of the app —
                  this is a match ranking, not a shop — and the volume is what
                  actually differs between two products you are choosing
                  between on formula.
                */}
                <View className="mt-3 gap-2 border-t border-hairline pt-3">
                  <Row
                    label="Match"
                    value={score === null ? "-" : `${score}%`}
                    className={tone ? TONE_TEXT[tone] : "text-ink"}
                  />
                  <Row label="Size" value={product.volume} />
                  <Row label="Ingredients" value={String(product.ingredients.length)} />
                  <Row
                    label="Flagged"
                    value={String(flaggedCount)}
                    className={flaggedCount > 0 ? "text-status-avoid" : "text-status-safe"}
                  />
                </View>

                <Text className="pt-4 text-[9.5px] font-semibold uppercase tracking-[0.7px] text-ink-faint">
                  Ingredients
                </Text>
                <View className="gap-2.5 pt-2.5">
                  {product.ingredients.map((ingredient) => (
                    <View key={ingredient.id} className="gap-1">
                      <Text className="text-[11px] leading-[14px] text-ink-muted" numberOfLines={2}>
                        {ingredient.name}
                      </Text>
                      <View className="flex-row">
                        <SafetyPill level={ingredient.safety} />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View className="border-t border-hairline bg-surface px-4 pb-8 pt-4">
        <PrimaryButton
          variant="outline"
          size={50}
          label="Clear comparison"
          onPress={() => {
            // Clearing used to leave you looking at this same screen's own
            // "nothing selected" state, with a link back to browse buried in
            // it — a dead end dressed up as a result. Clearing the tray and
            // having nothing left to compare means the natural next stop is
            // the product list, so go there directly.
            clearCompare();
            router.replace("/");
          }}
        />
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  className = "text-ink",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Text className="text-[10.5px] text-ink-faint">{label}</Text>
      <Text className={`text-[11.5px] font-semibold tabular-nums ${className}`}>{value}</Text>
    </View>
  );
}
