import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";
import { fetchProduct } from "@/data/api";
import type { Ingredient, ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { ingredientTone, matchProduct, positionWeightLabel, ruleFor } from "@/lib/matching";
import { targetApplies } from "@/lib/rules";
import { isVerified } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

/**
 * Ingredient detail — screen 5 of the Skintel Screens design.
 *
 * The design fills this screen with encyclopaedia copy: a written definition,
 * a personalised verdict, and three "things to know" bullets. We hold none of
 * that as prose. What we do hold is the curated rule, the CosIng function
 * list, the EU regulatory status and the ingredient's position in the formula
 * — so the sections keep the design's shape and are filled from those instead.
 *
 * The design's closing "See studies and evidence" card is dropped rather than
 * drawn: there is no evidence source behind it, and a card that goes nowhere
 * is worse than one less section.
 */

type Rung = "good" | "watch" | "avoid" | "neutral";

const RUNG: Record<
  Rung,
  { pill: string; ink: string; dot: string; label: string; panel: string; hero: string }
> = {
  good: {
    pill: "bg-level-good-tint",
    ink: "text-level-good-ink",
    dot: "bg-level-good",
    label: "Good for you",
    panel: "bg-panel-success border-panel-success-line",
    hero: COLORS.levelGood,
  },
  watch: {
    pill: "bg-level-watch-tint",
    ink: "text-level-watch-ink",
    dot: "bg-level-watch",
    label: "Worth knowing",
    panel: "bg-tint-peach border-tint-peach",
    hero: COLORS.levelWatch,
  },
  avoid: {
    pill: "bg-level-avoid-tint",
    ink: "text-level-avoid-ink",
    dot: "bg-level-avoid",
    label: "Flagged for you",
    panel: "bg-tint-pink border-tint-pink",
    hero: COLORS.levelAvoid,
  },
  neutral: {
    pill: "bg-level-neutral-tint",
    ink: "text-level-neutral-ink",
    dot: "bg-level-neutral",
    label: "Not recognised",
    panel: "bg-hairline border-hairline",
    hero: COLORS.levelNeutral,
  },
};

/** A round flask tile, standing in for the design's raster hero illustration. */
function FlaskHero({ color }: { color: string }) {
  return (
    <View
      className="h-[86px] w-[86px] items-center justify-center rounded-full"
      style={{ backgroundColor: `${color}26` }}
    >
      <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
        <Path
          d="M9.5 3h5M10.5 3v6.2L5.8 17.4A2.2 2.2 0 0 0 7.7 20.8h8.6a2.2 2.2 0 0 0 1.9-3.4L13.5 9.2V3"
          stroke={color}
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path d="M8.2 14.6h7.6" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

export default function IngredientDetail() {
  const { inci, product: productId } = useLocalSearchParams<{
    inci: string;
    product?: string;
  }>();

  const [product, setProduct] = useState<ProductWithIngredients | null>(null);
  const [loading, setLoading] = useState(Boolean(productId));
  const profile = useAppStore((s) => s.profile);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    setLoading(true);
    fetchProduct(productId)
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
  }, [productId]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  const index = product?.ingredients.findIndex((i) => i.name === inci) ?? -1;
  const ingredient: Ingredient =
    index >= 0 && product
      ? product.ingredients[index]
      : { id: inci, name: inci, comedogenic: 0, safety: "safe", verified: false };

  const match = product ? matchProduct(product, profile) : null;
  const verified = isVerified(ingredient);
  const rung: Rung = !verified
    ? "neutral"
    : match
      ? ((t) => (t === "flag" ? "avoid" : t))(ingredientTone(ingredient, match))
      : "watch";
  const meta = RUNG[rung];

  const rule = ruleFor(ingredient);
  const helps = rule ? targetApplies(rule.helps, profile) : false;
  const hurts = rule ? targetApplies(rule.hurts, profile) : false;

  const total = product?.ingredients.length ?? 0;
  const position = index >= 0 ? index + 1 : null;

  // Everything under "Things to know" is sourced, never written. When there is
  // nothing to source, the section does not render.
  const notes = [
    verified ? `EU status: ${regulatoryStatus(ingredient)}` : null,
    ingredient.functions && ingredient.functions.length > 0
      ? `Declared function: ${ingredient.functions.slice(0, 3).join(", ")}`
      : null,
    position !== null
      ? `#${position} of ${total} on the label — ${positionWeightLabel(index)}`
      : null,
    rule?.hurts?.sensitive ? "Our rules flag this as a common irritant for sensitive skin" : null,
  ].filter((n): n is string => n !== null);

  return (
    <View className="flex-1 bg-canvas">
      <Stack.Screen options={{ title: product?.name ?? "Ingredient" }} />

      <ScrollView contentContainerClassName="pb-40">
        <View className="flex-row items-start gap-4 px-6 pt-6">
          <View className="flex-1 gap-2.5">
            <Text className="font-display text-[32px] capitalize leading-[34px] text-[#463F57]">
              {ingredient.name}
            </Text>
            <View className={`flex-row items-center gap-2 self-start rounded-full px-3.5 py-2 ${meta.pill}`}>
              <View className={`h-2 w-2 rounded-full ${meta.dot}`} />
              <Text className={`text-[12.5px] font-medium ${meta.ink}`}>{meta.label}</Text>
            </View>
          </View>
          <FlaskHero color={meta.hero} />
        </View>

        {/* What it does — the curated rule when there is one, the regulator's
            own function list when there isn't. */}
        {(rule || (ingredient.functions && ingredient.functions.length > 0)) && (
          <View className="gap-3 px-6 pt-9">
            <Text className="text-[15.5px] font-semibold text-ink">What it does</Text>
            <Text className="text-[13.5px] leading-[21px] text-ink-muted">
              {rule
                ? rule.reason
                : `Declared in the EU inventory as ${ingredient.functions!
                    .slice(0, 3)
                    .join(", ")
                    .toLowerCase()}.`}
            </Text>
          </View>
        )}

        {/* How it fits your skin — the personalised half, and the only place
            on the screen that reads the profile. */}
        {rule && (
          <View className="gap-3.5 px-6 pt-9">
            <Text className="text-[15.5px] font-semibold text-ink">How it fits your skin</Text>
            <View className={`gap-3 rounded-card border p-[18px] ${meta.panel}`}>
              <Text className="font-display text-lg text-ink">
                {hurts
                  ? "Works against your profile"
                  : helps
                    ? "Great match"
                    : "Neutral for your profile"}
              </Text>
              <Text className="text-[13px] leading-[19px] text-ink-muted">
                {hurts
                  ? "This is one of the things pulling the score down for the skin you described."
                  : helps
                    ? "This actively helps with what you told us about your skin."
                    : "Neither helps nor hurts, given the answers you gave."}
              </Text>
            </View>
          </View>
        )}

        {!verified && (
          <View className="mx-6 mt-9 gap-2 rounded-card bg-tint-peach p-[18px]">
            <Text className="text-[15.5px] font-semibold text-ink">
              We couldn&apos;t identify this
            </Text>
            <Text className="text-[13px] leading-[19px] text-ink">
              This name didn&apos;t match our ingredient dictionary, so it carries no
              rating in either direction. Label text is often mis-transcribed, and
              guessing would be worse than saying nothing.
            </Text>
          </View>
        )}

        {notes.length > 0 && (
          <View className="gap-[18px] px-6 pt-11">
            <Text className="text-[15.5px] font-semibold text-ink">Things to know</Text>
            {notes.map((note) => (
              <View key={note} className="flex-row items-center gap-3">
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="m5 12.6 4.6 4.6L19 6.8"
                    stroke={meta.hero}
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
                <Text className="flex-1 text-[13px] leading-[18px] text-ink-muted">{note}</Text>
              </View>
            ))}
          </View>
        )}

        <Text className="px-6 pt-9 text-[11.5px] text-ink-faint">
          Reference data from Open Beauty Facts and EU CosIng.
        </Text>
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 flex-row gap-3 border-t border-hairline bg-canvas px-6 pb-8 pt-3">
        <Pressable
          onPress={() => {
            if (!product || index < 0) return router.back();
            const next = product.ingredients[(index + 1) % product.ingredients.length];
            router.replace({
              pathname: "/ingredient/[inci]",
              params: { inci: next.name, product: product.id },
            });
          }}
          className="h-[52px] flex-1 items-center justify-center rounded-control bg-accent active:bg-accent-deep"
        >
          <Text className="text-sm font-semibold text-white">Next ingredient</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          className="h-[52px] items-center justify-center rounded-control border border-hairline bg-surface px-5 active:bg-canvas"
        >
          <Text className="text-[13px] font-semibold text-ink">Back to list</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The honest replacement for the design's EWG hazard score. This comes from the
 * EU Annex lists via CosIng, which is a regulator rather than an advocacy
 * group's rating, and is one of the few genuinely authoritative facts we hold.
 */
function regulatoryStatus(ingredient: Ingredient): string {
  if (!isVerified(ingredient)) return "Unmatched";
  if (ingredient.safety === "avoid") return "Prohibited";
  if (ingredient.safety === "caution") return "Restricted";
  return "No restriction";
}
