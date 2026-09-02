import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { Text } from "@/components/Text";
import { fetchProduct } from "@/data/api";
import type { Ingredient, ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import {
  ingredientTone,
  matchProduct,
  positionWeightLabel,
  ruleFor,
  TONE_CLASS,
} from "@/lib/matching";
import { targetApplies } from "@/lib/rules";
import { isVerified } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

/**
 * Ingredient detail — screen 1b of the Skin Match Scanner design.
 *
 * The design's three stat cards were Hazard (EWG /10), Pore-clog (/5) and
 * Irritation. We hold none of those: there is no EWG licence, and CosIng —
 * a regulatory glossary — rates no ingredient for pore-clogging, so
 * `comedogenic` is NULL for all 31,817 rows.
 *
 * Rather than print plausible numbers, the cards show what we can actually
 * source: EU regulatory status, the ingredient's declared function, and
 * whether our own rules mark it as a problem for sensitive skin. Same shape,
 * same glanceability, nothing invented.
 */
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
    fetchProduct(productId).then((result) => {
      if (cancelled) return;
      setProduct(result);
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
  const tone = match ? ingredientTone(ingredient, match) : "watch";
  const rule = ruleFor(ingredient);
  const verified = isVerified(ingredient);

  const helps = rule ? targetApplies(rule.helps, profile) : false;
  const hurts = rule ? targetApplies(rule.hurts, profile) : false;

  const total = product?.ingredients.length ?? 0;
  const position = index >= 0 ? index + 1 : null;

  return (
    <View className="flex-1 bg-canvas">
      <Stack.Screen options={{ title: product?.name ?? "Ingredient" }} />

      <ScrollView contentContainerClassName="pb-40">
        <View className={`mx-5 mt-2 gap-3 rounded-sheet p-5 ${TONE_CLASS[tone].hero}`}>
          <View className="flex-row items-start justify-between gap-3">
            <Text className="flex-1 font-display text-[28px] capitalize leading-8 text-ink">
              {ingredient.name}
            </Text>
            <View className="rounded-full bg-canvas/70 px-3 py-1.5">
              <Text className="text-[11px] font-bold text-ink">
                {tone === "good"
                  ? "LOW RISK FOR YOU"
                  : tone === "watch"
                    ? "WORTH KNOWING"
                    : "FLAGGED FOR YOU"}
              </Text>
            </View>
          </View>

          {ingredient.functions && ingredient.functions.length > 0 && (
            <View className="flex-row flex-wrap gap-1.5">
              {ingredient.functions.slice(0, 4).map((fn) => (
                <View key={fn} className="rounded-full bg-canvas/70 px-2.5 py-1">
                  <Text className="text-[11.5px] font-semibold capitalize text-ink">{fn}</Text>
                </View>
              ))}
            </View>
          )}

          <Text className="text-[9.5px] font-medium uppercase tracking-[0.6px] text-ink-muted">
            INCI · {ingredient.name}
          </Text>
        </View>

        {/* Three facts we can actually stand behind. */}
        <View className="flex-row gap-2.5 px-5 pt-4">
          <StatCard
            label="EU status"
            value={regulatoryStatus(ingredient)}
            hint={verified ? "CosIng" : "unmatched"}
          />
          <StatCard
            label="Role"
            value={
              ingredient.functions && ingredient.functions.length > 0
                ? ingredient.functions[0]
                : "Unknown"
            }
            hint="declared function"
          />
          <StatCard
            label="Sensitive skin"
            value={rule?.hurts?.sensitive ? "Can irritate" : verified ? "No flag" : "Unknown"}
            hint="our rules"
          />
        </View>

        {position !== null && (
          <View className="gap-2 px-5 pt-5">
            <View className="flex-row items-baseline justify-between">
              <Text className="text-[13px] font-bold text-ink">In this formula</Text>
              <Text className="text-[11.5px] text-ink-muted">
                #{position} of {total} · {positionWeightLabel(index)}
              </Text>
            </View>
            <View className="h-1.5 overflow-hidden rounded-full bg-ink/10">
              <View
                className="h-full rounded-full bg-ink"
                style={{ width: `${Math.max(4, Math.round((1 - index / total) * 100))}%` }}
              />
            </View>
            {/* Position is regulated information, not a guess: INCI lists run in
                descending concentration. We say where it sits, and deliberately
                not what percentage that implies — that cannot be known. */}
            <Text className="text-[12.5px] leading-5 text-ink-muted">
              Ingredients are listed in descending order of concentration, so this sits
              among the {index < 5 ? "main" : index < 12 ? "mid-list" : "trace"} components.
            </Text>
          </View>
        )}

        {rule && (
          <View className="mx-5 mt-5 gap-2.5 rounded-sheet bg-tint-mint p-5">
            <Text className="text-[13px] font-bold text-ink">For your skin</Text>
            <Bullet ok text={rule.reason} />
            {helps && <Bullet ok text="Actively helps with what you told us about your skin." />}
            {hurts && (
              <Bullet
                ok={false}
                text="Works against your profile — this is what pulled the score down."
              />
            )}
            {!helps && !hurts && (
              <Bullet ok text="Neutral for your profile — neither helps nor hurts." />
            )}
          </View>
        )}

        {!verified && (
          <View className="mx-5 mt-5 gap-2 rounded-sheet bg-tint-peach p-5">
            <Text className="text-[13px] font-bold text-ink">We couldn&apos;t identify this</Text>
            <Text className="text-[12.5px] leading-5 text-ink">
              This name didn&apos;t match our ingredient dictionary, so it carries no
              rating in either direction. Label text is often mis-transcribed, and
              guessing would be worse than saying nothing.
            </Text>
          </View>
        )}

        <View className="gap-1.5 px-5 pt-5">
          <Text className="text-[11.5px] text-ink-faint">
            Reference data from Open Beauty Facts and EU CosIng.
          </Text>
        </View>
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 flex-row gap-2.5 border-t border-hairline bg-canvas px-5 pb-8 pt-3">
        <Pressable
          onPress={() => {
            if (!product || index < 0) return router.back();
            const next = product.ingredients[(index + 1) % product.ingredients.length];
            router.replace({
              pathname: "/ingredient/[inci]",
              params: { inci: next.name, product: product.id },
            });
          }}
          className="h-[52px] flex-1 items-center justify-center rounded-full bg-ink active:opacity-80"
        >
          <Text className="text-[14.5px] font-semibold text-canvas">Next ingredient</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          className="h-[52px] items-center justify-center rounded-full bg-ink/[0.06] px-5"
        >
          <Text className="text-[13px] font-semibold text-ink">Back to list</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View className="flex-1 gap-1 rounded-card bg-surface p-3 shadow-sm">
      <Text className="text-[9px] font-bold uppercase tracking-[1.1px] text-ink-faint">
        {label}
      </Text>
      <Text className="text-[13px] font-semibold capitalize leading-4 text-ink">{value}</Text>
      <Text className="text-[10px] text-ink-faint">{hint}</Text>
    </View>
  );
}

function Bullet({ ok, text }: { ok: boolean; text: string }) {
  return (
    <View className="flex-row items-start gap-2.5">
      <View
        className={`mt-0.5 h-4 w-4 items-center justify-center rounded-full ${
          ok ? "bg-ink" : "bg-tint-pink"
        }`}
      >
        <Text className={`text-[9.5px] font-bold ${ok ? "text-canvas" : "text-ink"}`}>
          {ok ? "✓" : "!"}
        </Text>
      </View>
      <Text className="flex-1 text-[12.5px] leading-[18px] text-ink">{text}</Text>
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
