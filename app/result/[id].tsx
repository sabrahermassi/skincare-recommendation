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

/**
 * `border` is new for the Skintel Screens restyle — the Result mockup's hero
 * card is bordered, not just tinted. `headline` is deliberately plain ink for
 * three of the four states: the mockup only shows the "good" verdict, whose
 * headline is a specific dark green (`#4B7A5E`) rather than the app's ink —
 * that one value is used directly since it's evidenced. Deriving matching
 * dark variants of `tone-watch`/`tone-flag` for the other three states would
 * mean inventing three more colors with no mockup to check them against, so
 * they keep the neutral, always-legible ink headline instead — `status.*`
 * (the app's OTHER color family) is not an option here regardless: it is
 * "the same for every user" regulatory-safety semantics, and this verdict is
 * "does this suit *you*", the `tone` semantics — the two are kept apart on
 * purpose (see `tint.lilac`'s usage elsewhere on this screen for the same
 * rule applied to a different pair).
 */
const HERO: Record<Verdict, { bg: string; border: string; headline: string; label: string }> = {
  good: { bg: "bg-tint-mint", border: "border-tone-good/25", headline: "text-[#4B7A5E]", label: "Good match" },
  mixed: { bg: "bg-tint-peach", border: "border-tone-watch/30", headline: "text-ink", label: "Worth a look" },
  poor: { bg: "bg-tint-pink", border: "border-tone-flag/30", headline: "text-ink", label: "Not for you" },
  unknown: { bg: "bg-hairline", border: "border-ink/10", headline: "text-ink", label: "Can't tell" },
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
          className="rounded-full bg-accent px-6 py-3"
        >
          <Text className="font-semibold text-canvas">Scan another</Text>
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
            carries a word too. Bordered card + display-face headline per the
            Result mockup, in place of the previous plain tinted band. */}
        <View
          className={`mx-5 mt-2 flex-row items-center gap-4 rounded-sheet border p-5 ${hero.bg} ${hero.border}`}
        >
          <ScoreRing score={match.score} size={82} tone={match.verdict} />
          <View className="flex-1 gap-1">
            <Text className={`font-display text-[19px] leading-6 ${hero.headline}`}>
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
          <Text className="text-[10px] font-bold uppercase tracking-[1.4px] text-ink-faint">
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
          <View className="gap-1 px-5 pt-6">
            <Text className="text-[13px] font-bold text-ink">What moved the score</Text>
            {/* "Why? We analyzed N factors" from the Result mockup — reads
                match.factors.length rather than a fixed count, since the
                real number varies by formula and profile. */}
            <Text className="pb-2 text-[10.5px] text-ink-faint">
              Why? We analyzed {match.factors.length}{" "}
              {match.factors.length === 1 ? "factor" : "factors"}.
            </Text>
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
            <Text className="text-[13px] font-bold text-ink">The one thing to check</Text>
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
              className="mt-1 self-start rounded-full bg-accent px-4 py-2 active:opacity-80"
            >
              <Text className="text-xs font-semibold text-canvas">Open that ingredient</Text>
            </Pressable>
          </View>
        )}

        {hasFormula && (
          <View className="flex-row gap-2.5 px-5 pt-5">
            <StatCard
              label="Flagged for you"
              value={flagged === 0 ? "Nothing" : `${flagged} of ${total}`}
              good={flagged === 0}
            />
            <StatCard label="Working for you" value={`${actives} of ${total}`} good={actives > 0} />
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
              className="h-[52px] items-center justify-center rounded-full bg-accent active:opacity-80"
            >
              <Text className="text-sm font-semibold text-canvas">
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

      {/* Thumb zone: the two things you do next. Stacked full-width, per the
          Result mockup — was a wide primary beside a square icon-only save
          button; the mockup stacks two full-width buttons instead, the
          second one labelled rather than icon-only. Primary is now the
          accent color, matching every button in every mockup screen read
          (Quiz, Scanner, Result all agree on #7A6BB0) rather than the
          previous plain-ink fill. */}
      <View className="absolute inset-x-0 bottom-0 gap-2.5 border-t border-hairline bg-canvas px-5 pb-8 pt-3">
        <Pressable
          onPress={() =>
            hasFormula
              ? router.push({ pathname: "/ingredients/[id]", params: { id: product.id } })
              : router.replace("/scan")
          }
          className="h-[52px] items-center justify-center rounded-full bg-accent active:opacity-80"
        >
          <Text className="text-[14.5px] font-semibold text-canvas">
            {hasFormula ? `See all ${total} ingredients` : "Scan another"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => toggleSaved(product.id)}
          className={`h-[52px] flex-row items-center justify-center gap-2 rounded-full border ${
            saved ? "border-tone-flag/40 bg-tint-pink" : "border-hairline bg-surface"
          }`}
        >
          <Text className="text-base text-ink">{saved ? "♥" : "♡"}</Text>
          <Text className="text-[14.5px] font-semibold text-ink">
            {saved ? "Saved to your shelf" : "Save to your shelf"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Bordered, tinted card per the Result mockup's stat-card pattern — but kept
 * on this app's own real metric (a count, e.g. "2 of 24") rather than the
 * mockup's categorical "Low"/"Medium"/"High" risk word, which this app has
 * no computed risk-tier for. Inventing one to match the mockup's copy would
 * be exactly the kind of fabricated signal `lib/rules.ts` and this screen's
 * own top comment both explicitly refuse elsewhere — a count is what's
 * actually measured, so a count is what's shown, just in the mockup's
 * card shape.
 */
function StatCard({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <View
      className={`flex-1 gap-1.5 rounded-card border p-3.5 ${
        good ? "border-tone-good/25 bg-tint-mint" : "border-hairline bg-surface"
      }`}
    >
      <Text className="text-[9px] font-bold uppercase tracking-[1.2px] text-ink-faint">
        {label}
      </Text>
      <Text className={`text-[15px] font-semibold ${good ? "text-[#4B7A5E]" : "text-ink"}`}>
        {value}
      </Text>
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
