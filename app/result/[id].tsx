import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { FactorBar } from "@/components/FactorBar";
import { ScoreRing } from "@/components/ScoreRing";
import { Text } from "@/components/Text";
import { fetchProduct } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { biggestConcern, matchProduct, verdictHeadline, type Verdict } from "@/lib/matching";
import { profileSummary } from "@/lib/profile";
import { isVerified } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

/**
 * "Why this score" — screen 2b of the Skin Match Scanner design.
 *
 * The whole app funnels here. It answers the Olive Young question (INCIDecoder
 * → comedogenic check → review site) in one view: a score, the factors behind
 * it, and the single thing most worth a second look.
 *
 * Every number on this screen is derived from the formula. Where the design
 * called for data we do not hold — an EWG hazard score, a comedogenic rating —
 * the card shows something we can actually source instead of a plausible
 * fabrication.
 */

const HERO: Record<Verdict, { bg: string; label: string }> = {
  good: { bg: "bg-tint-mint", label: "Good match" },
  mixed: { bg: "bg-tint-peach", label: "Worth a look" },
  poor: { bg: "bg-tint-pink", label: "Not for you" },
  unknown: { bg: "bg-hairline", label: "Can't tell" },
};

export default function ScanResult() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<ProductWithIngredients | null>(null);
  const [loading, setLoading] = useState(true);

  const profile = useAppStore((s) => s.profile);
  const savedProducts = useAppStore((s) => s.savedProducts);
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const recordView = useAppStore((s) => s.recordView);
  const saved = savedProducts.some((p) => p.id === id);
  const loggedId = useRef<string | null>(null);

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

  useEffect(() => {
    if (!product || loggedId.current === product.id) return;
    loggedId.current = product.id;
    const { score, warnings } = matchProduct(product, useAppStore.getState().profile);
    recordView({ id: product.id, known: true, score, warnings: warnings.length });
  }, [product, recordView]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (!product) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-canvas px-8">
        <Text className="font-display text-2xl text-ink">Product not found</Text>
        <Pressable
          onPress={() => router.replace("/scan")}
          className="rounded-full bg-ink px-6 py-3"
        >
          <Text className="font-sans-semibold text-canvas">Scan another</Text>
        </Pressable>
      </View>
    );
  }

  const match = matchProduct(product, profile);
  const hero = HERO[match.verdict];
  const concern = biggestConcern(match);
  const summary = profileSummary(profile);
  const hasFormula = product.ingredients.length > 0;

  const total = product.ingredients.length;
  const flagged = match.reasons.filter((r) => r.effect < 0).length + match.warnings.length;
  const actives = product.ingredients.filter(
    (i) => isVerified(i) && match.reasons.some((r) => r.ingredient === i.name && r.effect > 0)
  ).length;

  return (
    <View className="flex-1 bg-canvas">
      <Stack.Screen options={{ title: product.brand }} />

      <ScrollView contentContainerClassName="pb-40">
        {/* The verdict, before anything else. Never colour alone — the band
            carries a word too. */}
        <View className={`mx-5 mt-2 flex-row items-center gap-4 rounded-sheet p-5 ${hero.bg}`}>
          <ScoreRing score={match.score} />
          <View className="flex-1 gap-1">
            <Text className="text-[15px] font-sans-bold text-ink">
              {hero.label}
              {concern && match.score !== null ? ", one caveat" : ""}
            </Text>
            <Text className="text-xs leading-4 text-ink-muted">
              {match.score !== null && summary
                ? `Scored against your ${summary.toLowerCase()} profile — not an average shopper.`
                : verdictHeadline(match)}
            </Text>
          </View>
        </View>

        <View className="gap-1 px-5 pt-4">
          <Text className="text-[10px] font-sans-bold uppercase tracking-[1.4px] text-ink-faint">
            {product.brand}
          </Text>
          <Text className="font-display text-[23px] leading-7 text-ink">{product.name}</Text>
          <Text className="text-xs text-ink-muted">
            {[product.volume, hasFormula ? `${total} ingredients` : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>

        {match.factors.length > 0 && (
          <View className="gap-3 px-5 pt-6">
            <Text className="text-[13px] font-sans-bold text-ink">What moved the score</Text>
            <View className="gap-3.5">
              {match.factors.map((factor) => (
                <FactorBar key={factor.category} factor={factor} />
              ))}
            </View>
          </View>
        )}

        {/* The one thing to check — the largest factor working against you. */}
        {concern && (
          <View className="mx-5 mt-5 gap-2 rounded-sheet bg-tint-peach p-5">
            <Text className="text-[13px] font-sans-bold text-ink">The one thing to check</Text>
            <Text className="text-[12.5px] leading-5 text-ink">
              {concern.note} {concern.ingredients.length === 1 ? "is" : "are"} the main thing
              working against your profile here
              {positionNote(product, concern.ingredients[0])}.
            </Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/ingredient/[inci]",
                  params: { inci: concern.ingredients[0], product: product.id },
                })
              }
              className="mt-1 self-start rounded-full bg-ink px-4 py-2 active:opacity-80"
            >
              <Text className="text-xs font-sans-semibold text-canvas">Open that ingredient</Text>
            </Pressable>
          </View>
        )}

        {hasFormula && (
          <View className="flex-row gap-2.5 px-5 pt-5">
            <StatCard label="Flagged for you" value={flagged === 0 ? "Nothing" : `${flagged} of ${total}`} />
            <StatCard label="Working for you" value={`${actives} of ${total}`} />
          </View>
        )}

        {!hasFormula && (
          <View className="mx-5 mt-5 gap-3 rounded-sheet bg-tint-lilac p-5">
            <Text className="text-[12.5px] leading-5 text-accent-text">
              We know this product but not what&apos;s in it. Photograph the ingredient
              list and we&apos;ll read it — once, for everyone.
            </Text>
            <Pressable
              onPress={() => router.push(`/scan-label?barcode=${product.barcode}`)}
              className="rounded-full bg-ink py-3 active:opacity-80"
            >
              <Text className="text-center text-sm font-sans-semibold text-canvas">
                Photograph the ingredients
              </Text>
            </Pressable>
          </View>
        )}

        {match.coverage > 0 && match.coverage < 1 && hasFormula && (
          <Text className="px-5 pt-4 text-[11px] text-ink-faint">
            We recognised {Math.round(match.coverage * 100)}% of this ingredient list.
          </Text>
        )}

        {/* This screen is a judgement, so the caveat belongs on it. */}
        <View className="mx-5 mb-2 mt-6 rounded-card bg-tint-lilac px-4 py-3">
          <Text className="text-[11px] leading-4 text-accent-text">
            Ingredient information only — not medical or dermatological advice.
            Formulas change and label data can be incomplete.
          </Text>
        </View>

        {product.attribution ? (
          <Text className="px-5 text-[10.5px] leading-4 text-ink-faint">{product.attribution}</Text>
        ) : null}
      </ScrollView>

      {/* Thumb zone: the two things you do next. */}
      <View className="absolute inset-x-0 bottom-0 flex-row gap-2.5 border-t border-hairline bg-canvas px-5 pb-8 pt-3">
        <Pressable
          onPress={() =>
            hasFormula
              ? router.push({ pathname: "/ingredients/[id]", params: { id: product.id } })
              : router.replace("/scan")
          }
          className="h-[52px] flex-1 items-center justify-center rounded-full bg-ink active:opacity-80"
        >
          <Text className="text-[14.5px] font-sans-semibold text-canvas">
            {hasFormula ? `See all ${total} ingredients` : "Scan another"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => toggleSaved(product.id)}
          className={`h-[52px] w-[52px] items-center justify-center rounded-full ${
            saved ? "bg-tint-pink" : "bg-ink/[0.06]"
          }`}
        >
          <Text className="text-lg text-ink">{saved ? "♥" : "♡"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 gap-1.5 rounded-card bg-surface p-3.5 shadow-sm">
      <Text className="text-[9px] font-sans-bold uppercase tracking-[1.2px] text-ink-faint">
        {label}
      </Text>
      <Text className="text-[13px] font-sans-semibold text-ink">{value}</Text>
    </View>
  );
}

/**
 * INCI order is regulated descending-concentration data, so where something
 * sits changes how much it matters. Saying "#11 of 24" is the difference
 * between a warning and a useful warning.
 */
function positionNote(product: ProductWithIngredients, ingredientName: string): string {
  const index = product.ingredients.findIndex((i) => i.name === ingredientName);
  if (index === -1) return "";
  return `, at #${index + 1} of ${product.ingredients.length}`;
}
