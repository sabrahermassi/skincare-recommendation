import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";

import { BottleIcon } from "@/components/BottleIcon";
import { RiskCards } from "@/components/RiskCards";
import { ScoreRing } from "@/components/ScoreRing";
import { CompareIcon, HeartIcon } from "@/components/icons";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { fetchProduct } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { matchProduct, verdictHeadline, type Verdict } from "@/lib/matching";
import { CATEGORY_LABEL } from "@/lib/rules";
import { isVerified } from "@/lib/safety";
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
 *
 * ONE ANSWER PER QUESTION
 *
 * The screen used to state the same thing repeatedly: a score, then weighted
 * factor bars, then two risk cards, then risk tiers, then a caveat in the
 * middle and a second caveat at the bottom. Pore-clogging alone appeared three
 * times. Someone holding a bottle in a shop reads none of that.
 *
 * The order is now: what it is, the score, the two risk verdicts, which
 * ingredients caused the pore-clogging one, one line of why in words, the
 * caveat. Detail lives one tap away behind "View ingredients", never stacked
 * on top of the answer.
 */

/**
 * Labels are the MVP's locked wording, not a paraphrase: the four bands are a
 * product decision the user reads the same way every time, so "Fair match"
 * rather than the older "Worth a look". Excellent and good share the sage
 * palette — the label carries the distinction, which keeps the screen from
 * needing a fifth colour that means "yes, but more so".
 */
const PANEL: Record<Verdict, { bg: string; border: string; label: string; ink: string }> = {
  excellent: { bg: "#EAF3EC", border: "#CFE4D6", label: "Excellent match", ink: "#3F6B50" },
  good: { bg: "#EAF3EC", border: "#DCEBE0", label: "Good match", ink: "#4B7A5E" },
  fair: { bg: "#FBF0E4", border: "#F2E2CE", label: "Fair match", ink: "#8A6314" },
  poor: { bg: "#FBEAEC", border: "#F2D8DC", label: "Poor match", ink: "#A2521F" },
  unknown: { bg: "#F3EFEA", border: "#E9E4DD", label: "Can't tell yet", ink: "#5C5566" },
};

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
    // `loading` starts true for the initial mount, but this effect also
    // re-runs when `id` changes while the screen stays mounted — without
    // resetting it here too, the previous product stays on screen while
    // the new one fetches.
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
        setProduct(null);
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
          <PrimaryButton label="Scan another" onPress={() => router.replace("/")} />
        </View>
      </View>
    );
  }

  const match = matchProduct(product, profile);
  const panel = PANEL[match.verdict];
  const total = product.ingredients.length;
  const recognised = product.ingredients.filter(isVerified).length;

  // The same factors the weighted bars used to draw, said as words. The
  // direction of each factor is the part a shopper can act on; the magnitude
  // was never anything but our own rule weight.
  const helps = match.factors
    .filter((f) => f.delta > 0)
    .map((f) => CATEGORY_LABEL[f.category].toLowerCase());
  const against = match.factors
    .filter((f) => f.delta < 0)
    .map((f) => CATEGORY_LABEL[f.category].toLowerCase());

  async function share() {
    if (!product) return;
    const line =
      match.score === null
        ? `${product.brand} ${product.name} - checked on Skintell`
        : `${product.brand} ${product.name} - ${match.score}/100 for my skin, on Skintell`;
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

        {/* Two boxes, directly under the score: the only two risks the screen
            states as a verdict. Each one is a button when it has something to
            show — tap it to see exactly which ingredients are behind it,
            rather than repeating the list on this screen too. Irritation
            routes to Watch-outs (the same "not good for you" set the pore
            card would otherwise duplicate); pore-clogging routes to its own
            tab. */}
        <RiskCards
          product={product}
          match={match}
          onIrritationPress={() =>
            router.push({
              pathname: "/ingredients/[id]",
              params: { id: product.id, tab: "Watch-outs" },
            })
          }
          onPorePress={() =>
            router.push({
              pathname: "/ingredients/[id]",
              params: { id: product.id, tab: "Pore clogging" },
            })
          }
        />

        {/*
          One line of "why", in words.

          This replaced a stack of weighted bars reading "Barrier support −7 /
          Pore-clogging −6". Those numbers are internal scoring arithmetic —
          a hand-set rule weight, scaled by position in the list and by whether
          the product rinses off — and they were being shown as though they
          measured something. Nobody could read them, which for a screen whose
          job is to answer one question in a shop aisle makes them worse than
          nothing.
        */}
        {(helps.length > 0 || against.length > 0) && (
          <View style={{ marginHorizontal: 24, marginTop: 22, gap: 6 }}>
            {helps.length > 0 && (
              <Text className="text-[12.5px] leading-[18px] text-ink-body">
                <Text className="font-semibold text-ink">Works for you: </Text>
                {helps.join(", ")}.
              </Text>
            )}
            {against.length > 0 && (
              <Text className="text-[12.5px] leading-[18px] text-ink-body">
                <Text className="font-semibold text-ink">Works against you: </Text>
                {against.join(", ")}.
              </Text>
            )}
            <Text className="pt-1 text-[11px] text-ink-faint">
              From {recognised} of {total} ingredients we could identify.
            </Text>
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
          One caveat, at the bottom. There were two — a grey box mid-screen
          and this one — which is both redundant and, in the middle of the
          screen, in the way of the answer. It stays required (the INCI API
          terms forbid presenting their data as medically validated without a
          disclaimer, and `lib/matching.ts` is still an explicit placeholder),
          but it is a footnote, not a headline.
        */}
        <View style={{ marginHorizontal: 24, marginTop: 30, marginBottom: 8 }}>
          <Text className="text-[10.5px] leading-[15px] text-ink-faint">
            Based on your skin profile and public ingredient data - not medical
            advice. Formulas change and label data can be out of date, so check
            the packaging for anything that matters.
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
