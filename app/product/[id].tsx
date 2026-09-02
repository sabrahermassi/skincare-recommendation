import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";

import { ProductIllustration } from "@/components/ProductIllustration";
import { ScreenHeader } from "@/components/ScreenHeader";
import { fetchProduct } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { matchProduct, matchTone, verdictHeadline } from "@/lib/matching";
import { groupByRisk, type RiskGroup } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

const TIER_META: Record<RiskGroup, { label: string; icon: string; color: string }> = {
  avoid: { label: "Needs a closer look", icon: "!", color: "bg-status-avoid" },
  caution: { label: "Some caution", icon: "•", color: "bg-status-caution" },
  clean: { label: "No concerns", icon: "✓", color: "bg-status-safe" },
  unknown: { label: "We couldn't identify these", icon: "?", color: "bg-ink-faint" },
};
// "unknown" sits last but above nothing: it is the honest tail of the list,
// not a footnote. Crowdsourced labels are often OCR-mangled, and these are the
// names we could not match to a dictionary.
const TIER_ORDER: RiskGroup[] = ["avoid", "caution", "unknown", "clean"];

/**
 * The match band's fill. Green only when the score has earned it — the design
 * draws its sample as a great match, but the same panel has to carry a poor
 * one without reading as praise.
 */
const BAND = {
  high: { bg: "bg-panel-success border-panel-success-line", label: "Great match", ink: "text-status-safe" },
  medium: { bg: "bg-tint-peach border-tint-peach", label: "Fair match", ink: "text-status-caution" },
  low: { bg: "bg-tint-pink border-tint-pink", label: "Poor match", ink: "text-status-watch" },
} as const;

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<ProductWithIngredients | null>(null);
  const [loading, setLoading] = useState(true);

  const profile = useAppStore((s) => s.profile);
  const savedProducts = useAppStore((s) => s.savedProducts);
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const compareIds = useAppStore((s) => s.compareIds);
  const toggleCompare = useAppStore((s) => s.toggleCompare);
  const recordView = useAppStore((s) => s.recordView);
  const saved = savedProducts.some((p) => p.id === id);
  const inCompare = compareIds.includes(id);
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

  // Opening a product logs it, so "have I already checked this?" is answerable
  // without the user having had the foresight to save it. Keyed on the product
  // alone and guarded by a ref: reading the profile through `getState` keeps a
  // later profile edit from re-firing this and inflating the view count.
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
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <Text className="text-ink-muted">Product not found.</Text>
      </View>
    );
  }

  const match = matchProduct(product, profile);
  const tone = match.score === null ? null : matchTone(match.score);
  const band = tone ? BAND[tone] : null;
  const riskGroups = groupByRisk(product.ingredients);
  const total = product.ingredients.length;

  return (
    <View className="flex-1 bg-canvas">
      {/* Back chevron and heart on the canvas, as the design draws it — no
          system header bar above. */}
      <ScreenHeader
        right={
          <Pressable
            onPress={() => toggleSaved(product.id)}
            hitSlop={12}
            accessibilityLabel={saved ? "Remove from saved" : "Save"}
            accessibilityState={{ selected: saved }}
          >
            <Svg width={21} height={21} viewBox="0 0 24 24" fill={saved ? COLORS.ink : "none"}>
              <Path
                d="M12 20.2s-7.6-4.7-7.6-9.7A4.4 4.4 0 0 1 12 7.7a4.4 4.4 0 0 1 7.6 2.8c0 5-7.6 9.7-7.6 9.7Z"
                stroke={COLORS.ink}
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        }
      />

      <ScrollView contentContainerClassName="pb-32">
        <View className="items-center px-5 pt-4">
          {product.imageUrl ? (
            <Image
              source={{ uri: product.imageUrl }}
              style={{ width: 150, height: 150, borderRadius: 15 }}
              contentFit="contain"
              transition={150}
              accessibilityLabel={`${product.brand} ${product.name}`}
            />
          ) : (
            <ProductIllustration type={product.type} size={150} />
          )}
        </View>

        <View className="items-center gap-1.5 px-5 pt-4">
          <Text className="text-[10px] font-semibold uppercase tracking-[0.9px] text-ink-faint">
            {product.brand}
          </Text>
          <Text className="text-center font-display text-[23px] leading-7 text-ink">
            {product.name}
          </Text>
          <Text className="text-[12.5px] text-ink-muted">
            {[product.volume, product.type, total > 0 ? `${total} ingredients` : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {!product.inStock && (
            <Text className="text-[12.5px] font-semibold text-status-avoid">Out of stock</Text>
          )}
        </View>

        {/* The verdict, before the detail. Never colour alone — the band
            carries a word too. */}
        {band && match.score !== null ? (
          <View className={`mx-5 mt-5 flex-row items-center gap-4 rounded-card border p-4 ${band.bg}`}>
            <Text className="text-[30px] font-semibold leading-none tracking-tight text-ink">
              {match.score}
              <Text className="text-[13px] font-medium text-ink-muted">%</Text>
            </Text>
            <View className="flex-1 gap-1">
              <Text className={`font-display text-lg leading-[20px] ${band.ink}`}>
                {band.label}
              </Text>
              <Text className="text-xs leading-4 text-ink-muted">{verdictHeadline(match)}</Text>
            </View>
          </View>
        ) : (
          <View className="mx-5 mt-5 rounded-card bg-tint-lilac px-4 py-3.5">
            <Text className="text-xs leading-4 text-accent-text">{verdictHeadline(match)}</Text>
          </View>
        )}

        {/*
          The design draws this as a checklist. `benefits` supplies the bullets
          where a row has them, but that is only the hand-written catalogue —
          Open Beauty Facts and the INCI API return a formula and a label, not
          copywriting, so for a real product the list is empty. `description`
          is always populated, so it carries the section instead of leaving a
          hole where the design put content.
        */}
        <View className="gap-3 px-5 pt-7">
          <Text className="text-[10.5px] font-bold uppercase tracking-[0.9px] text-ink-faint">
            What it does
          </Text>
          {product.benefits.length > 0 ? (
            product.benefits.map((benefit) => (
              <View key={benefit} className="flex-row items-center gap-2.5">
                <Text className="text-[15px] font-bold text-status-safe">✓</Text>
                <Text className="flex-1 text-[12.5px] leading-[17px] text-ink">{benefit}</Text>
              </View>
            ))
          ) : (
            <Text className="text-[12.5px] leading-[19px] text-ink-muted">
              {product.description}
            </Text>
          )}
        </View>

        {total > 0 && (
          <View className="gap-3 px-5 pt-7">
            <Text className="text-[10.5px] font-bold uppercase tracking-[0.9px] text-ink-faint">
              Ingredients by risk
            </Text>
            {TIER_ORDER.map((tier) => {
              const items = riskGroups[tier];
              if (items.length === 0) return null;
              const meta = TIER_META[tier];

              return (
                <View
                  key={tier}
                  className="flex-row items-center gap-3 rounded-card border border-hairline bg-surface px-4 py-4"
                >
                  <View
                    className={`h-[26px] w-[26px] items-center justify-center rounded-full ${meta.color}`}
                  >
                    <Text className="text-[13px] font-bold text-white">{meta.icon}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[13px] font-semibold text-ink">{meta.label}</Text>
                    <Text className="mt-0.5 text-[11px] leading-[15px] text-ink-muted" numberOfLines={2}>
                      {items.map((i) => i.name).join(", ")}
                    </Text>
                  </View>
                  <Text className="text-[13px] font-semibold tabular-nums text-ink-muted">
                    {items.length}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {total === 0 && (
          <View className="mx-5 mt-7 gap-3 rounded-card bg-tint-lilac p-[18px]">
            <Text className="text-[13px] font-semibold text-accent-text">
              We know this product but not what&apos;s in it
            </Text>
            <Text className="text-[12.5px] leading-[19px] text-accent-text">
              Nobody has read this label yet, so there is no ingredient list to
              judge. Photograph the back of the pack and we&apos;ll read it —
              once, for everyone.
            </Text>
          </View>
        )}

        {/*
          Required by the INCI API terms, which forbid presenting their data as
          medically validated without a disclaimer — and true regardless, since
          `lib/matching.ts` is still an explicit placeholder.
        */}
        <View className="mx-5 mb-4 mt-7 rounded-card bg-tint-lilac px-4 py-3">
          <Text className="text-xs leading-4 text-accent-text">
            Ingredient information only — not medical or dermatological advice.
            Formulas change, and label data can be out of date or incomplete.
            Check the packaging and ask a professional about anything that matters.
          </Text>
        </View>

        {product.attribution ? (
          <Text className="px-5 text-[11px] leading-4 text-ink-faint">{product.attribution}</Text>
        ) : null}
      </ScrollView>

      {/*
        Thumb zone. The design draws two controls here — the primary action and
        the heart. Compare is the third, because the design's browse list
        dropped the "Add to compare" button the grid card used to carry, and
        without an entry point somewhere the compare screen is unreachable.
      */}
      <View className="absolute inset-x-0 bottom-0 flex-row gap-3 border-t border-hairline bg-canvas px-5 pb-8 pt-3">
        <Pressable
          onPress={() =>
            total > 0
              ? router.push({ pathname: "/ingredients/[id]", params: { id: product.id } })
              : router.push(`/scan-label?barcode=${product.barcode}`)
          }
          className="h-[52px] flex-1 items-center justify-center rounded-control bg-accent active:bg-accent-deep"
        >
          <Text className="text-sm font-semibold text-white">
            {total > 0 ? "View ingredients" : "Photograph the ingredients"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => toggleCompare(product.id)}
          accessibilityLabel={inCompare ? "Remove from compare" : "Add to compare"}
          accessibilityState={{ selected: inCompare }}
          className={`h-[52px] w-[52px] items-center justify-center rounded-control border ${
            inCompare ? "border-accent bg-tint-lilac" : "border-hairline bg-surface"
          }`}
        >
          <Text className={`text-lg ${inCompare ? "text-accent-text" : "text-ink"}`}>⇄</Text>
        </Pressable>

        <Pressable
          onPress={() => toggleSaved(product.id)}
          accessibilityLabel={saved ? "Remove from saved" : "Save"}
          accessibilityState={{ selected: saved }}
          className={`h-[52px] w-[52px] items-center justify-center rounded-control border ${
            saved ? "border-transparent bg-tint-pink" : "border-hairline bg-surface"
          }`}
        >
          <Text className="text-lg text-ink">{saved ? "♥" : "♡"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
