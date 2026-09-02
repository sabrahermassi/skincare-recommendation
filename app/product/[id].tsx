import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { Text } from "@/components/Text";

import { BottleIcon } from "@/components/BottleIcon";
import { FactorBar } from "@/components/FactorBar";
import { PoreCloggingBand } from "@/components/PoreCloggingBand";
import { RiskCards } from "@/components/RiskCards";
import { ScoreRing } from "@/components/ScoreRing";
import { CompareIcon, HeartIcon } from "@/components/icons";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { fetchProduct } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { matchProduct, verdictHeadline, type Verdict } from "@/lib/matching";
import { groupByRisk, isVerified, type RiskGroup } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

/**
 * The product screen — one screen, however you arrive at it.
 *
 * There used to be two: a "scan result" carrying the score ring, the factor
 * breakdown and the risk cards, and a "product detail" carrying a hero tile, a
 * flat match band and the ingredient tiers. Tapping the same bottle from the
 * shelf and from the browse list therefore showed two different-looking answers
 * to the same question. `app/result/[id].tsx` renders this file now, so the
 * post-scan route keeps working with one rendering behind both.
 *
 * Every number here is derived from the formula. Where the design called for
 * data we do not hold — an EWG hazard score, a written verdict — the screen
 * shows something we can actually source instead of a plausible fabrication.
 */

const PANEL: Record<Verdict, { bg: string; border: string; label: string; ink: string }> = {
  good: { bg: "#EAF3EC", border: "#DCEBE0", label: "Good match", ink: "#4B7A5E" },
  mixed: { bg: "#FBF0E4", border: "#F2E2CE", label: "Worth a look", ink: "#8A6314" },
  poor: { bg: "#FBEAEC", border: "#F2D8DC", label: "Not for you", ink: "#A2521F" },
  unknown: { bg: "#F3EFEA", border: "#E9E4DD", label: "Can't tell yet", ink: "#5C5566" },
};

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

export default function ProductScreen() {
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
      <View className="flex-1 bg-canvas">
        <ScreenHeader />
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="font-display text-2xl text-ink">Product not found</Text>
          <PrimaryButton label="Scan another" onPress={() => router.replace("/scan")} />
        </View>
      </View>
    );
  }

  const match = matchProduct(product, profile);
  const panel = PANEL[match.verdict];
  const riskGroups = groupByRisk(product.ingredients);
  const total = product.ingredients.length;
  const recognised = product.ingredients.filter(isVerified).length;

  async function share() {
    if (!product) return;
    const line =
      match.score === null
        ? `${product.brand} ${product.name} — checked on Skintel`
        : `${product.brand} ${product.name} — ${match.score}/100 for my skin, on Skintel`;
    try {
      await Share.share({ message: line });
    } catch (err) {
      console.warn("share failed:", err);
    }
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader
        right={
          <Pressable onPress={share} hitSlop={12} accessibilityLabel="Share this result">
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 15.5V3.4M7.8 7.6 12 3.4l4.2 4.2M5 13.6V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.4"
                stroke="#453F4E"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
        {/*
          The design's product screen opens on a 150pt hero with the brand,
          name and size centred under it (screen 11); the verdict panel below
          is the scan result's (screen 02). Merging the two screens meant
          keeping both, not picking one — the hero is how you confirm you are
          looking at the right bottle.
        */}
        <View style={{ alignItems: "center", paddingHorizontal: 20, paddingTop: 18 }}>
          <BottleIcon type={product.productType} size={150} />
        </View>

        <View style={{ alignItems: "center", gap: 6, paddingHorizontal: 20, paddingTop: 18 }}>
          <Text className="text-[10px] font-semibold uppercase tracking-[0.9px] text-ink-faint">
            {product.brand}
          </Text>
          <Text className="text-center font-display text-[23px] leading-[28px] tracking-[-0.28px] text-ink">
            {product.name}
          </Text>
          <Text className="text-[12.5px] text-ink-muted">
            {[product.volume, product.type, total > 0 ? `${total} ingredients` : null]
              .filter(Boolean)
              .join("  ·  ")}
          </Text>
          {!product.inStock && (
            <Text className="text-[12.5px] font-semibold text-status-avoid">Out of stock</Text>
          )}
        </View>

        {/* The verdict, before anything else. Never colour alone — the panel
            carries a word too. */}
        <View
          className="flex-row items-center rounded-card border"
          style={{
            marginHorizontal: 24,
            marginTop: 20,
            gap: 20,
            paddingHorizontal: 20,
            paddingVertical: 22,
            backgroundColor: panel.bg,
            borderColor: panel.border,
          }}
        >
          <ScoreRing
            score={match.score}
            size={82}
            label="/100"
            tone={match.verdict}
          />
          <View className="flex-1 gap-1.5 pr-6">
            <Text
              className="font-display text-[21px] leading-[23px] tracking-tight"
              style={{ color: panel.ink }}
            >
              {panel.label}
            </Text>
            <Text className="text-[13px] leading-[18.5px] text-ink-body">
              {verdictHeadline(match)}
            </Text>
          </View>

          <Pressable
            onPress={() => toggleSaved(product.id)}
            hitSlop={10}
            accessibilityLabel={saved ? "Remove from shelf" : "Save to my shelf"}
            accessibilityState={{ selected: saved }}
            className="absolute right-4 top-4"
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill={saved ? panel.ink : "none"}>
              <Path
                d="M12 20.2s-7.6-4.7-7.6-9.7A4.4 4.4 0 0 1 12 7.7a4.4 4.4 0 0 1 7.6 2.8c0 5-7.6 9.7-7.6 9.7Z"
                stroke={panel.ink}
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        </View>

        {/* The pore-clogging answer, above the fold. This is the question the
            app is replacing a three-site copy-paste routine to answer, so it
            sits directly under the verdict rather than in the risk cards
            further down, which are below the fold on a phone. */}
        <PoreCloggingBand
          ingredients={product.ingredients}
          onPress={
            product.ingredients.length > 0
              ? () =>
                  router.push({
                    pathname: "/ingredients/[id]",
                    params: { id: product.id, tab: "Pores" },
                  })
              : undefined
          }
        />

        {match.factors.length > 0 ? (
          <>
            <Text className="pt-6 text-center text-[10.5px] text-ink-muted">
              Why? We read {recognised} of {total} ingredients.
            </Text>
            <View className="px-6 pt-4">
              {match.factors.map((factor) => (
                <FactorBar key={factor.category} factor={factor} />
              ))}
            </View>
          </>
        ) : (
          <Text className="px-6 pt-5 text-center text-[12.5px] leading-[18px] text-ink-muted">
            Nothing in this formula matched a rule we hold, so there is no
            breakdown to show — the score above is the whole answer.
          </Text>
        )}

        {/* This screen is a judgement, so the caveat belongs on it. */}
        <View className="mx-6 mt-4 flex-row items-center justify-center gap-2.5 rounded-control bg-panel-wash px-4 py-3">
          <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={12} r={9} stroke={COLORS.inkMuted} strokeWidth={1.8} />
            <Path
              d="M12 11v5.4M12 7.7v.1"
              stroke={COLORS.inkMuted}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </Svg>
          <Text className="text-center text-[10.5px] leading-[15px] text-ink-muted">
            Based on your skin profile and public ingredient data. Not medical advice.
          </Text>
        </View>

        <RiskCards product={product} match={match} />

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
                  style={{ gap: 12, paddingHorizontal: 15, paddingVertical: 16 }}
                  className="flex-row items-center rounded-card border border-hairline bg-surface"
                >
                  <View
                    style={{ height: 28, width: 28 }}
                    className={`items-center justify-center rounded-full ${meta.color}`}
                  >
                    <Text className="text-[13px] font-bold leading-[16px] text-white">
                      {meta.icon}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text className="text-[13px] font-semibold text-ink">{meta.label}</Text>
                    <Text className="mt-0.5 text-[11px] leading-[15px] text-ink-muted" numberOfLines={2}>
                      {items.map((i) => i.name).join(", ")}
                    </Text>
                  </View>
                  {/* Fixed width and centred, so a two-digit count can't push
                      the row's contents around or clip against the edge. */}
                  <View style={{ minWidth: 26, alignItems: "flex-end" }}>
                    <Text className="text-[14px] font-semibold tabular-nums text-ink-muted">
                      {items.length}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {total === 0 && (
          <View style={{ marginHorizontal: 20, marginTop: 28, gap: 12, padding: 18 }} className="rounded-card bg-tint-lilac">
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
        <View style={{ marginHorizontal: 20, marginTop: 36, marginBottom: 16 }} className="rounded-card bg-tint-lilac px-4 py-3.5">
          <Text className="text-xs leading-4 text-accent-text">
            Ingredient information only — not medical or dermatological advice.
            Formulas change, and label data can be out of date or incomplete.
            Check the packaging and ask a professional about anything that matters.
          </Text>
        </View>

        {product.attribution ? (
          <Text className="px-6 pt-5 text-[10.5px] leading-4 text-ink-faint">
            {product.attribution}
          </Text>
        ) : null}
      </ScrollView>

      {/*
        Thumb zone. The design draws two controls here — the primary action and
        the heart. Compare is the third, because the design's browse list
        dropped the "Add to compare" button the grid card used to carry, and
        without an entry point somewhere the compare screen is unreachable.

        It used to be an unlabelled square with a two-headed arrow in it, which
        told nobody what it did. It says what it does now, on its own row.
      */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          gap: 10,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 32,
        }}
        className="border-t border-hairline bg-canvas"
      >
        <View style={{ flexDirection: "row", gap: 12 }}>
          <PrimaryButton
            className="flex-1"
            label={total > 0 ? "View ingredients" : "Photograph the ingredients"}
            onPress={() =>
              total > 0
                ? router.push({ pathname: "/ingredients/[id]", params: { id: product.id } })
                : router.push(`/scan-label?barcode=${product.barcode}`)
            }
          />

          <Pressable
            onPress={() => toggleSaved(product.id)}
            accessibilityRole="button"
            accessibilityLabel={saved ? "Remove from saved" : "Save"}
            accessibilityState={{ selected: saved }}
            style={{ height: 56, width: 56 }}
            className={`items-center justify-center rounded-control border ${
              saved ? "border-transparent bg-tint-pink" : "border-hairline bg-surface"
            }`}
          >
            <HeartIcon size={20} filled={saved} />
          </Pressable>
        </View>

        <PrimaryButton
          variant="outline"
          size={50}
          active={inCompare}
          label={inCompare ? "In your comparison" : "Add to comparison"}
          onPress={() => toggleCompare(product.id)}
          icon={<CompareIcon size={17} color={inCompare ? COLORS.accentText : COLORS.ink} />}
        />
      </View>
    </View>
  );
}
