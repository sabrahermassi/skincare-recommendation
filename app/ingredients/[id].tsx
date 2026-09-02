import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { fetchProduct } from "@/data/api";
import type { Ingredient, ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { relativeTime } from "@/lib/format";
import { ingredientTone, matchProduct, ruleFor, type MatchResult } from "@/lib/matching";
import { isVerified } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

/**
 * The full ingredient list — screen 3 of the Skintel Screens design.
 *
 * Every row is judged against *this* profile, not in the abstract: the dot and
 * the pill say whether it works for you, which is the whole difference between
 * this and reading the back of the box.
 */

type Tab = "All" | "Actives" | "Watch-outs";

/**
 * Four rungs, drawn soft. `ingredientTone` returns three, because it answers
 * "does this work for you"; an unrecognised name is a fourth thing — not good,
 * not a warning, just unassessed — and the design gives it its own quiet grey
 * rather than lumping it in with the watch-outs.
 */
type Rung = "good" | "watch" | "avoid" | "neutral";

const RUNG: Record<Rung, { dot: string; pill: string; ink: string; label: string }> = {
  good: { dot: "bg-level-good", pill: "bg-level-good-tint", ink: "text-level-good-ink", label: "Good" },
  watch: { dot: "bg-level-watch", pill: "bg-level-watch-tint", ink: "text-level-watch-ink", label: "Watch" },
  avoid: { dot: "bg-level-avoid", pill: "bg-level-avoid-tint", ink: "text-level-avoid-ink", label: "Avoid" },
  neutral: { dot: "bg-level-neutral", pill: "bg-level-neutral-tint", ink: "text-level-neutral-ink", label: "Neutral" },
};

function rungFor(ingredient: Ingredient, match: MatchResult): Rung {
  if (!isVerified(ingredient)) return "neutral";
  const tone = ingredientTone(ingredient, match);
  return tone === "flag" ? "avoid" : tone;
}

export default function IngredientList() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<ProductWithIngredients | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("All");

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

  if (loading || !match) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (!product) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-8">
        <Text className="font-display text-2xl text-ink">Product not found</Text>
      </View>
    );
  }

  const visible = product.ingredients.filter((i) => {
    if (tab === "Actives") return ruleFor(i) !== undefined;
    if (tab === "Watch-outs") return rungFor(i, match) !== "good";
    return true;
  });

  const total = product.ingredients.length;

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Ingredients" />

      <ScrollView contentContainerClassName="pb-4">
        <View className="flex-row gap-2.5 px-6 pt-5">
          {(["All", "Actives", "Watch-outs"] as const).map((label) => {
            const active = tab === label;
            return (
              <Pressable
                key={label}
                onPress={() => setTab(label)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                className={`h-[38px] flex-1 items-center justify-center rounded-full border ${
                  active ? "border-accent bg-tint-lilac" : "border-hairline bg-surface"
                }`}
              >
                <Text
                  className={`text-[12.5px] font-medium ${
                    active ? "text-accent-text" : "text-ink"
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Formulas change. Saying when we last read the label is the
            difference between data and a claim — it was on this screen before
            the redesign and is worth more than the design's info icon. */}
        <Text className="pb-1 pt-3.5 text-center text-[10.5px] text-ink-muted">
          {total} ingredient{total === 1 ? "" : "s"} · Tap for details
        </Text>
        <Text className="pb-3.5 text-center text-[10.5px] text-ink-faint">
          Label read {relativeTime(Date.parse(product.fetchedAt ?? "") || Date.now())}
        </Text>
        <View className="h-px bg-hairline" />

        {visible.length === 0 ? (
          <Text className="bg-surface py-10 text-center text-sm text-ink-muted">
            Nothing in this group — which is good news.
          </Text>
        ) : (
          visible.map((ingredient) => (
            <IngredientListRow
              key={ingredient.id}
              ingredient={ingredient}
              rung={rungFor(ingredient, match)}
              onPress={() =>
                router.push({
                  pathname: "/ingredient/[inci]",
                  params: { inci: ingredient.name, product: product.id },
                })
              }
            />
          ))
        )}
      </ScrollView>

      {/* INCI order is regulated information, and it is the single fact that
          makes this list readable rather than just long. */}
      <View className="flex-row items-center justify-center gap-2.5 bg-hairline/40 px-6 pb-8 pt-4">
        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={9} stroke={COLORS.inkMuted} strokeWidth={1.8} />
          <Path
            d="M12 11v5.4M12 7.7v.1"
            stroke={COLORS.inkMuted}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </Svg>
        <Text className="text-[10.5px] text-ink-muted">
          Ingredients are listed in order of concentration.
        </Text>
      </View>
    </View>
  );
}

function IngredientListRow({
  ingredient,
  rung,
  onPress,
}: {
  ingredient: Ingredient;
  rung: Rung;
  onPress: () => void;
}) {
  const meta = RUNG[rung];
  const rule = ruleFor(ingredient);

  // The most specific thing we hold, in order: a curated rule, the row's own
  // note, then the regulator's declared function list.
  const subtitle = !isVerified(ingredient)
    ? "Not recognised — we can't assess this one"
    : rule
      ? rule.reason.split("—")[0].trim()
      : (ingredient.note ?? functionLabel(ingredient));

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-start gap-3 border-b border-hairline-soft bg-surface px-6 py-3.5 active:bg-canvas"
    >
      <View className={`mt-1.5 h-[9px] w-[9px] rounded-full ${meta.dot}`} />

      <View className="flex-1 gap-0.5">
        <Text className="text-[13.5px] font-medium capitalize leading-[18px] text-ink">
          {ingredient.name}
        </Text>
        <Text className="text-[11px] leading-[16px] text-ink-muted">{subtitle}</Text>
      </View>

      <View className={`mt-px rounded-full px-3 py-1 ${meta.pill}`}>
        <Text className={`text-[11px] font-medium ${meta.ink}`}>{meta.label}</Text>
      </View>

      <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" style={{ marginTop: 5 }}>
        <Path
          d="m9 5 7 7-7 7"
          stroke={COLORS.inkFaint}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

/** Falls back to the CosIng function list when no curated rule applies. */
function functionLabel(ingredient: Ingredient): string {
  return ingredient.functions && ingredient.functions.length > 0
    ? ingredient.functions.slice(0, 2).join(" · ")
    : "No concerns for your profile";
}
