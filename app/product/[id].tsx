import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";

import { PrimaryButton } from "@/components/PrimaryButton";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { RiskCards } from "@/components/RiskCards";
import { ScoreRing } from "@/components/ScoreRing";
import { HeartIcon } from "@/components/icons";
import { ScreenHeader } from "@/components/ScreenHeader";
import { fetchProduct } from "@/data/api";
import { PRODUCT_TYPE_LABEL, type ProductWithIngredients } from "@/data/types";
import {
  confidenceLabel,
  matchProduct,
  scoreExplanation,
  verdictHeadline,
  type MatchReason,
  type Verdict,
} from "@/lib/matching";
import { isVerified } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, MUTED_FAINT, SELECTED_STRONG, VERDICT, VERDICT_NEUTRAL, toneForVerdict } from "@/lib/tokens";

// Manassa system (design/DESIGN_SYSTEM.md). The peach CTAs on this screen
// draw from the shared `PrimaryButton` component's `tone="cta"` — added
// specifically so this screen (and browse, the pasted-list empty state, and
// ingredient detail) stop hand-rolling the same button and drifting apart,
// which they already had by the time this was written (three different
// corner radii across the four files). `PrimaryButton`'s *default* tone is
// still the old purple/lilac fill every screen not yet restyled to Manassa
// uses — `tone="cta"` opts a call site in, it never changes the default.

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
// The five bands' display label - the one thing that still needs full
// per-Verdict granularity, since excellent/good share a tone but not a word.
const PANEL_LABEL: Record<Verdict, string> = {
  excellent: "Excellent match",
  good: "Good match",
  fair: "Fair match",
  poor: "Poor match",
  unknown: VERDICT_NEUTRAL.label,
};

/**
 * Excellent and good are both a yes — they share the green and are told
 * apart by the number in the ring, not by a fourth colour. Colours come from
 * `toneForVerdict`, the one place that collapse happens, rather than a
 * second hand-copy of it here disagreeing with `ScoreRing`'s someday.
 */
function panelFor(verdict: Verdict): { bg: string; border: string; label: string; ink: string } {
  const tone = toneForVerdict(verdict);
  const colors = tone
    ? { bg: VERDICT[tone].tint, border: VERDICT[tone].solid, ink: VERDICT[tone].deep }
    : { bg: VERDICT_NEUTRAL.tint, border: BORDER_INACTIVE, ink: VERDICT_NEUTRAL.deep };
  return { ...colors, label: PANEL_LABEL[verdict] };
}

/**
 * One line of "why", naming the ingredient and carrying its own sentence.
 *
 * The sentence comes from `lib/rules.ts`, where every claim the app makes is
 * written next to the rule that makes it — so anything on screen here can be
 * traced to a line of code and argued with.
 */
function ReasonLine({ reason }: { reason: MatchReason }) {
  const positive = reason.effect > 0;
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      {/* Inline style, not a Tailwind className: `bg-tint-mint`/`bg-tint-pink`
          are also the scanner's unrelated "looking/missed" status icon, so
          they can't be repointed at the verdict ramp without recoloring that
          too. This reads the same VERDICT tokens the score ring above uses,
          rather than a third green/pink pair. */}
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          marginTop: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: positive ? VERDICT.high.tint : VERDICT.low.tint,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "bold", lineHeight: 13, color: INK }}>
          {positive ? "+" : "−"}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", textTransform: "capitalize", color: INK }}>
          {(reason.ingredient ?? "").toLowerCase()}
        </Text>
        <Text style={{ fontSize: 12, lineHeight: 17, color: MUTED }}>{reason.reason}</Text>
      </View>
    </View>
  );
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<ProductWithIngredients | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const profile = useAppStore((s) => s.profile);
  const savedProducts = useAppStore((s) => s.savedProducts);
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const recordView = useAppStore((s) => s.recordView);
  const saved = savedProducts.some((p) => p.id === id);
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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
        <ActivityIndicator color={INK} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={{ flex: 1, backgroundColor: CANVAS }}>
        <ScreenHeader />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 }}>
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 24, color: INK }}>
            Product not found
          </Text>
          <PrimaryButton tone="cta" size={52} label="Scan another" onPress={() => router.replace("/")} />
        </View>
      </View>
    );
  }

  const match = matchProduct(product, profile);
  const panel = panelFor(match.verdict);
  const total = product.ingredients.length;
  const recognised = product.ingredients.filter(isVerified).length;

  // The MVP asks for the top 2-3 positives and 1-3 concerns, each naming the
  // ingredient behind it. The engine has produced these sentences all along —
  // this screen used to throw them away and print category words instead
  // ("hydration, fragrance"), which named a direction but never a reason.
  const helps = match.reasons.filter((r) => r.effect > 0).slice(0, 3);
  const against = match.reasons.filter((r) => r.effect < 0).slice(0, 3);
  const explanation = scoreExplanation(match);
  const confidence = confidenceLabel(match.confidence);

  async function share() {
    if (!product) return;
    const line =
      match.score === null
        ? `${product.brand} ${product.name} - checked on Manassa`
        : `${product.brand} ${product.name} - ${match.score}/100 for my skin, on Manassa`;
    try {
      await Share.share({ message: line });
    } catch (err) {
      console.warn("share failed:", err);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader
        right={
          <Pressable onPress={share} hitSlop={12} accessibilityLabel="Share this result">
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 15.5V3.4M7.8 7.6 12 3.4l4.2 4.2M5 13.6V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.4"
                stroke={INK}
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
          <ProductThumbnail product={product} size={150} radius={24} />
        </View>

        <View style={{ alignItems: "center", gap: 6, paddingHorizontal: 20, paddingTop: 18 }}>
          <Text style={{ fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.9, color: MUTED_FAINT }}>
            {product.brand}
          </Text>
          <Text
            style={{
              textAlign: "center",
              fontFamily: "PlayfairDisplay_500Medium",
              fontSize: 23,
              lineHeight: 28,
              letterSpacing: -0.28,
              color: INK,
            }}
          >
            {product.name}
          </Text>
          <Text style={{ fontSize: 12.5, color: MUTED }}>
            {[
              product.volume,
              // A genuinely unidentified product says so nowhere near here —
              // showing "Unknown" as if it were a category answers a
              // question nobody asked. Just the size and the count stand on
              // their own for that state.
              //
              // Same reasoning extends to `brand === "Unknown"`: that's the
              // fallback the lookup/OCR/import paths write whenever the
              // source has no brand data for this barcode at all, which is
              // "we don't actually know this product" just as much as an
              // unclassified type is — showing a specific inferred category
              // (e.g. "Serum") directly under an admitted-unknown brand read
              // as a contradiction: unsure who made it, but sure what it is.
              product.type === "unknown" || product.brand === "Unknown"
                ? null
                : PRODUCT_TYPE_LABEL[product.type],
              total > 0 ? `${total} ingredients` : null,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </Text>
          {!product.inStock && (
            <Text className="text-[12.5px] font-semibold text-status-avoid">Out of stock</Text>
          )}
        </View>

        {/* The verdict, before anything else. Never colour alone — the panel
            carries a word too. Tapping it opens the breakdown in place rather
            than pushing a screen: the answer and its reasoning belong on the
            same surface when someone is holding the bottle in a shop. */}
        <Pressable
          onPress={() => setShowBreakdown((open) => !open)}
          disabled={explanation.length === 0}
          accessibilityRole="button"
          accessibilityLabel={
            showBreakdown ? "Hide how this score was worked out" : "How was this score worked out?"
          }
          accessibilityState={{ expanded: showBreakdown }}
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
              style={{
                fontFamily: "PlayfairDisplay_500Medium",
                fontSize: 21,
                lineHeight: 23,
                letterSpacing: -0.3,
                color: panel.ink,
              }}
            >
              {panel.label}
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 18.5, color: INK }}>
              {verdictHeadline(match)}
            </Text>
            {explanation.length > 0 && (
              <Text style={{ paddingTop: 2, fontSize: 11.5, fontWeight: "600", color: panel.ink }}>
                {showBreakdown ? "Hide the breakdown" : "How was this worked out?"}
              </Text>
            )}
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
        </Pressable>

        {/* What the number is actually made of, strongest first. The sentences
            come from lib/matching so the words and the arithmetic cannot
            drift apart. */}
        {showBreakdown && explanation.length > 0 && (
          <View
            style={{
              marginHorizontal: 24,
              marginTop: 10,
              gap: 12,
              padding: 16,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: BORDER_INACTIVE,
              backgroundColor: CANVAS,
            }}
          >
            {explanation.map((line) => (
              <View key={line.label} style={{ flexDirection: "row", gap: 10 }}>
                <View
                  style={{ width: 3, borderRadius: 2 }}
                  className={line.direction === "up" ? "bg-tone-good" : "bg-tone-flag"}
                />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: "600", color: INK }}>{line.label}</Text>
                  <Text style={{ fontSize: 12, lineHeight: 17, color: MUTED }}>{line.detail}</Text>
                </View>
              </View>
            ))}
            <Text style={{ fontSize: 11, lineHeight: 15, color: MUTED_FAINT }}>
              Ordered by how much each moved the score. Based on {recognised} of {total}{" "}
              ingredients we could identify — {confidence} confidence.
            </Text>
          </View>
        )}

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
          <View style={{ marginHorizontal: 24, marginTop: 26, gap: 14 }}>
            <Text style={{ fontSize: 9, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1.53, color: MUTED_FAINT }}>
              Why this score
            </Text>

            <View style={{ gap: 10 }}>
              {helps.map((reason) => (
                <ReasonLine key={`+${reason.ingredient}`} reason={reason} />
              ))}
              {against.map((reason) => (
                <ReasonLine key={`-${reason.ingredient}`} reason={reason} />
              ))}
            </View>

            <Text style={{ fontSize: 11, lineHeight: 15, color: MUTED_FAINT }}>
              From {recognised} of {total} ingredients we could identify
              {confidence === "high" ? "" : ` — ${confidence} confidence`}.
            </Text>
          </View>
        )}

        {total === 0 && (
          <View
            style={{
              marginHorizontal: 20,
              marginTop: 28,
              gap: 12,
              padding: 18,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: BORDER_INACTIVE,
              backgroundColor: CANVAS,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: INK }}>
              We know this product but not what&apos;s in it
            </Text>
            <Text style={{ fontSize: 12.5, lineHeight: 19, color: MUTED }}>
              Nobody has read this label yet, so there is no ingredient list to
              judge. Photograph the back of the pack and we&apos;ll read it —
              once, for everyone.
            </Text>
          </View>
        )}

        {/*
          One caveat, at the bottom. There were two — a grey box mid-screen
          and this one — which is both redundant and, in the middle of the
          screen, in the way of the answer. It stays required: the INCI API
          terms forbid presenting their data as medically validated without a
          disclaimer, and the MVP is explicit that this is an ingredient-based
          compatibility assessment rather than a safety guarantee. A footnote,
          not a headline.
        */}
        <View style={{ marginHorizontal: 24, marginTop: 30, marginBottom: 8 }}>
          <Text style={{ fontSize: 10.5, lineHeight: 15, color: MUTED_FAINT }}>
            Based on your skin profile and public ingredient data - not medical
            advice. Formulas change and label data can be out of date, so check
            the packaging for anything that matters.
          </Text>
        </View>

        {product.attribution ? (
          <Text style={{ paddingHorizontal: 24, paddingTop: 20, fontSize: 10.5, lineHeight: 16, color: MUTED_FAINT }}>
            {product.attribution}
          </Text>
        ) : null}
      </ScrollView>

      {/* Thumb zone. The design draws two controls here — the primary action
          and the heart. */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 32,
          borderTopWidth: 1,
          borderTopColor: BORDER_INACTIVE,
          backgroundColor: CANVAS,
        }}
      >
        <View style={{ flexDirection: "row", gap: 12 }}>
          <PrimaryButton
            tone="cta"
            size={56}
            style={{ flex: 1 }}
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
            style={{
              height: 56,
              width: 56,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 28,
              borderWidth: saved ? 0 : 1,
              borderColor: BORDER_INACTIVE,
              backgroundColor: saved ? SELECTED_STRONG : CANVAS,
            }}
          >
            <HeartIcon size={20} filled={saved} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
