import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";

import { PrimaryButton } from "@/components/PrimaryButton";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { IngredientsSheet, ingredientsSheetPeek } from "@/components/IngredientsSheet";
import { RiskCards } from "@/components/RiskCards";
import { ScoreRing } from "@/components/ScoreRing";
import { HeartIcon } from "@/components/icons";
import { BarcodeOfferPrompt } from "@/components/BarcodeOfferPrompt";
import { InlineProfilePrompt } from "@/components/InlineProfilePrompt";
import { ScreenHeader } from "@/components/ScreenHeader";
import { canPhotographLabelFor, failureMessage, fetchProduct, type FetchFailure } from "@/data/api";
import { PRODUCT_TYPE_LABEL, type ProductWithIngredients } from "@/data/types";
import {
  confidenceLabel,
  matchProduct,
  verdictHeadline,
  type MatchReason,
  type Verdict,
} from "@/lib/matching";
import { relativeTime } from "@/lib/format";
import { isPersonalized } from "@/lib/profile";
import { isVerified } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, MUTED_FAINT, TOUCH_TARGET, TYPE, VERDICT, VERDICT_LABEL, VERDICT_NEUTRAL, WARN, toneForVerdict } from "@/lib/tokens";

// The design system (design/DESIGN_SYSTEM.md). The peach CTAs on this screen
// draw from the shared `PrimaryButton` component's `tone="cta"` — added
// specifically so this screen (and browse, the pasted-list empty state, and
// ingredient detail) stop hand-rolling the same button and drifting apart,
// which they already had by the time this was written (three different
// corner radii across the four files). `PrimaryButton`'s *default* tone is
// still the old purple/lilac fill every screen not yet restyled to for.me
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

// The display label lives in lib/tokens as `VERDICT_LABEL`, with the note on
// why the wording is locked. It moved there because the browse and saved
// lists need the same words — they used to take theirs from the tone, which
// is how an 89 read "Great match" in a list and "Good match" here.

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
  return { ...colors, label: VERDICT_LABEL[verdict] };
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
        <Text style={{ fontSize: TYPE.caption, fontWeight: "bold", lineHeight: 14, color: INK }}>
          {positive ? "+" : "−"}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontSize: TYPE.label, fontWeight: "600", textTransform: "capitalize", color: INK }}>
          {(reason.ingredient ?? "").toLowerCase()}
        </Text>
        <Text style={{ fontSize: TYPE.label, lineHeight: 19, color: MUTED }}>{reason.reason}</Text>
      </View>
    </View>
  );
}

// See `staleNotice`.
const STALE_AFTER_MS = 182 * 24 * 60 * 60 * 1000;

export default function ProductScreen() {
  const insets = useSafeAreaInsets();
  const { id, offerBarcode, scanToken } = useLocalSearchParams<{
    id: string;
    offerBarcode?: string;
    scanToken?: string;
  }>();
  const [product, setProduct] = useState<ProductWithIngredients | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [loading, setLoading] = useState(true);
  /**
   * Set only when the catalogue could not be *asked*. Distinct from
   * `product === null`, which is the catalogue answering that it does not have
   * this id — "Product not found" is true of the second and a lie about the
   * first.
   */
  const [failure, setFailure] = useState<FetchFailure | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  /**
   * Which id the product in state belongs to.
   *
   * `product` is deliberately kept across a failed *retry* — what is already
   * on screen beats an error page. That is only right while the id has not
   * changed: without this, routing to a different product whose load then
   * failed left the previous one rendering under the new id, which is the
   * exact trap `app/ingredients/[id].tsx` documents on its own fetch.
   */
  const loadedFor = useRef<string | null>(null);

  // Captured once, on arrival, rather than read live. `isPersonalized` flips as
  // soon as a skin type is chosen, so a live check would unmount the panel on
  // the first tap and take the sensitivity question with it — the user would
  // answer one thing and watch the other vanish. Held for the visit instead:
  // the score above fills in, the answers stay visible and changeable, and it
  // is gone next time the screen opens.
  const [askForProfile] = useState(() => !isPersonalized(useAppStore.getState().profile));

  // Pinned at mount for the same reason the ingredient screen pins its own:
  // `react-hooks/purity` flags `Date.now()` during render.
  const [renderedAt] = useState(() => Date.now());

  const profile = useAppStore((s) => s.profile);
  const savedProducts = useAppStore((s) => s.savedProducts);
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const recordView = useAppStore((s) => s.recordView);
  const fillInViewScore = useAppStore((s) => s.fillInViewScore);
  const saved = savedProducts.some((p) => p.id === id);
  const loggedId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // `loading` starts true for the initial mount, but this effect also
    // re-runs when `id` changes while the screen stays mounted — without
    // resetting it here too, the previous product stays on screen while
    // the new one fetches.
    setLoading(true);
    setFailure(null);
    fetchProduct(id)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setProduct(result.value);
          loadedFor.current = id;
        } else {
          // A failed retry of the id already on screen keeps that copy — it
          // beats an error page. A failed load of a *different* id must not
          // inherit it. See `loadedFor`.
          if (loadedFor.current !== id) {
            setProduct(null);
            loadedFor.current = null;
          }
          setFailure(result.failure);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, retryKey]);

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

  // The effect above captures the score as it stood when the screen opened,
  // which for someone with no profile is no score at all. The inline prompt
  // below then collects the two answers that produce one — and history would
  // otherwise keep the blank. This fills it in without logging a second visit.
  //
  // It runs on every profile change while this screen is open, but
  // `fillInViewScore` only ever fills a blank: a log that rewrote its own past
  // entries whenever the profile changed would be a record of nothing, which
  // is a property the store tests hold directly.
  useEffect(() => {
    if (!product || loggedId.current !== product.id) return;
    const { score, warnings } = matchProduct(product, profile);
    fillInViewScore(product.id, { score, warnings: warnings.length });
  }, [product, profile, fillInViewScore]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
        <ActivityIndicator color={INK} />
      </View>
    );
  }

  // Before the `!product` branch, and the order is the whole point: "Product
  // not found" is the catalogue's answer, and we only have one if we reached
  // it. An outage rendering that copy tells the user their product does not
  // exist on the evidence of a failed request.
  if (failure && !product) {
    return (
      <View style={{ flex: 1, backgroundColor: CANVAS }}>
        <ScreenHeader />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 }}>
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: TYPE.heading, color: INK }}>
            Couldn&apos;t load this product
          </Text>
          <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>
            {failureMessage(failure)}
          </Text>
          <PrimaryButton tone="cta" size={52} label="Try again" onPress={() => setRetryKey((k) => k + 1)} />
          <Pressable
            onPress={() => router.push("/browse")}
            accessibilityRole="link"
            style={{ minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
              Browse the catalogue
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={{ flex: 1, backgroundColor: CANVAS }}>
        <ScreenHeader />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 }}>
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: TYPE.heading, color: INK }}>
            Product not found
          </Text>
          <PrimaryButton tone="cta" size={52} label="Scan another" onPress={() => router.replace("/")} />
          {/* "Scan another" assumes a physical bottle in hand, which isn't
              true for everyone who lands here — a stale link, a bookmark to
              a removed product. Same escape hatch the missed-barcode panel
              offers, for the same reason. */}
          <Pressable
            onPress={() => router.push("/browse")}
            accessibilityRole="link"
            style={{ minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
              Browse instead
            </Text>
          </Pressable>
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
  const confidence = confidenceLabel(match.confidence);

  // Six months. Long enough that a fresh catalogue never mentions it, short
  // enough to catch a formula that predates a plausible reformulation — brands
  // change one roughly every year or two, and the source finds out later
  // still. A row with no `fetchedAt` says nothing rather than guessing old.
  const fetchedAtMs = product.fetchedAt ? Date.parse(product.fetchedAt) : NaN;
  const staleNotice =
    Number.isFinite(fetchedAtMs) && renderedAt - fetchedAtMs > STALE_AFTER_MS
      ? `This formula was read ${relativeTime(fetchedAtMs, renderedAt)}. If the brand has reformulated since, the verdict above is judging the old list.`
      : null;

  // Step 8's own notice: unlike `staleNotice`, which only ever guesses that a
  // formula might be old, this one is certain — reconciliation (scripts/
  // reconcile-obf.mjs) already confirmed this exact product's ingredient list
  // changed. Shown only for a saved product, and only when the change
  // happened after the *formula version the user actually saved*, not after
  // the tap itself.
  //
  // That distinction matters: a device can open Browse against an old,
  // disk-cached catalogue, save a product from it, and only afterward have
  // the background freshness check install the reconciled row. `savedAt`
  // would then land *after* `formulaChangedAt` even though the user saved
  // the old formula and never saw the new one — comparing wall-clock time
  // alone would silently miss exactly the case this notice exists for.
  // Found by Codex on PR #122. `formulaFetchedAt`, recorded at save time,
  // pins which version was actually on screen; a row saved before this field
  // existed has none, and falls back to the original `savedAt` comparison —
  // an imperfect signal, but the one this notice always had for those rows.
  const savedEntry = savedProducts.find((p) => p.id === id);
  const formulaChangedAtMs = product.formulaChangedAt ? Date.parse(product.formulaChangedAt) : NaN;
  const savedVersionMs = savedEntry?.formulaFetchedAt ? Date.parse(savedEntry.formulaFetchedAt) : NaN;
  const savedBaselineMs = Number.isFinite(savedVersionMs) ? savedVersionMs : savedEntry?.savedAt;
  const formulaChangedNotice =
    savedEntry && Number.isFinite(formulaChangedAtMs) && savedBaselineMs !== undefined && formulaChangedAtMs > savedBaselineMs
      ? `This formula has changed since you saved it ${relativeTime(savedEntry.savedAt, renderedAt)}. The verdict above reflects the new ingredient list, not the one you saved.`
      : null;

  async function share() {
    if (!product) return;
    const line =
      match.score === null
        ? `${product.brand} ${product.name} - checked on for.me`
        : `${product.brand} ${product.name} - ${match.score}/100 for my skin, on for.me`;
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 22 }}>
            <Pressable
              onPress={() => toggleSaved(product.id, product.fetchedAt)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={saved ? "Remove from saved" : "Save"}
              accessibilityState={{ selected: saved }}
            >
              <HeartIcon size={21} filled={saved} />
            </Pressable>
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
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: total > 0 ? ingredientsSheetPeek(insets.bottom) + 96 : 200 }}>
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
          <Text style={{ fontSize: TYPE.caption, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.9, color: MUTED_FAINT }}>
            {product.brand}
          </Text>
          <Text
            style={{
              textAlign: "center",
              fontFamily: "PlayfairDisplay_500Medium",
              fontSize: TYPE.heading,
              lineHeight: 28,
              letterSpacing: -0.28,
              color: INK,
            }}
          >
            {product.name}
          </Text>
          <Text style={{ fontSize: TYPE.caption, color: MUTED }}>
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
            carries a word too. Its reasoning ("Why this score") opens inside
            the same box: the answer and the reasons belong on the same surface
            when someone is holding the bottle in a shop. */}
        <View
          className="rounded-card border"
          style={{
            marginHorizontal: 24,
            marginTop: 20,
            backgroundColor: panel.bg,
            borderColor: panel.border,
            overflow: "hidden",
          }}
        >
        <View className="flex-row items-center" style={{ gap: 20, paddingHorizontal: 20, paddingVertical: 22 }}>
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
                fontSize: TYPE.title,
                lineHeight: 23,
                letterSpacing: -0.3,
                color: panel.ink,
              }}
            >
              {panel.label}
            </Text>
            <Text style={{ fontSize: TYPE.body, lineHeight: 22, color: INK }}>
              {verdictHeadline(match)}
            </Text>
          </View>
        </View>

        {/*
          "Why this score", inside the box, closed until it is tapped: one line
          of "why" per ingredient, in words.

          This replaced a stack of weighted bars reading "Barrier support −7 /
          Pore-clogging −6". Those numbers are internal scoring arithmetic —
          a hand-set rule weight, scaled by position in the list and by whether
          the product rinses off — and they were being shown as though they
          measured something. Nobody could read them, which for a screen whose
          job is to answer one question in a shop aisle makes them worse than
          nothing.
        */}
        {helps.length > 0 || against.length > 0 ? (
          <>
            <Pressable
              onPress={() => setShowWhy((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel="Why this score"
              accessibilityState={{ expanded: showWhy }}
              style={{
                minHeight: TOUCH_TARGET,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                borderTopWidth: 1,
                borderTopColor: panel.border,
              }}
              className="active:opacity-70"
            >
              <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: panel.ink }}>Why this score</Text>
              <Svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                style={{ transform: [{ rotate: showWhy ? "270deg" : "90deg" }] }}
              >
                <Path d="m9 5 7 7-7 7" stroke={panel.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>

            {showWhy ? (
              <View style={{ paddingHorizontal: 20, paddingBottom: 18, paddingTop: 2, gap: 14 }}>
                <View style={{ gap: 10 }}>
                  {helps.map((reason) => (
                    <ReasonLine key={`+${reason.ingredient}`} reason={reason} />
                  ))}
                  {against.map((reason) => (
                    <ReasonLine key={`-${reason.ingredient}`} reason={reason} />
                  ))}
                </View>

                <Text style={{ fontSize: TYPE.caption, lineHeight: 16, color: MUTED }}>
                  From {recognised} of {total} ingredients we could identify
                  {confidence === "high" ? "" : ` — ${confidence} confidence`}.
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
        </View>

        {offerBarcode === "1" && scanToken && (
          <BarcodeOfferPrompt productId={id} scanToken={scanToken} />
        )}
        {askForProfile && <InlineProfilePrompt />}

        {/*
          How old the formula is, but only once it is old enough to matter.
          Nothing refreshes a catalogue row after it is written, so a verdict
          can be computed from a list read months ago and stated with exactly
          the same confidence as one read yesterday. The ingredient screen has
          always shown this; the screen that delivers the *judgement* did not,
          which is the wrong way round. Hidden below the threshold so it stays
          a signal rather than furniture — the pipeline fix for the underlying
          staleness is a separate, larger job.
        */}
        {staleNotice && (
          // WARN, not MUTED_FAINT — it used to render identically to the
          // page's routine disclaimer footnote below, which buried a
          // trust-relevant claim (this specific verdict may be judging an
          // old list) inside furniture text nobody reads. Same token
          // `saved.tsx`'s history rows already use for "flagged" counts.
          <Text
            style={{
              paddingHorizontal: 24,
              paddingTop: 12,
              fontSize: TYPE.label,
              lineHeight: 17,
              fontWeight: "600",
              color: WARN,
            }}
          >
            {staleNotice}
          </Text>
        )}

        {/*
          Step 8: a saved product whose formula reconciliation has actually
          confirmed changed since it was saved, not merely aged past a
          threshold. Same WARN treatment as staleNotice above — this is the
          stronger claim of the two, so it should never read as quieter.
        */}
        {formulaChangedNotice && (
          <Text
            style={{
              paddingHorizontal: 24,
              paddingTop: 12,
              fontSize: TYPE.label,
              lineHeight: 17,
              fontWeight: "600",
              color: WARN,
            }}
          >
            {formulaChangedNotice}
          </Text>
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
            <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>
              We know this product but not what&apos;s in it
            </Text>
            <Text style={{ fontSize: TYPE.body, lineHeight: 22, color: MUTED }}>
              Nobody has read this label yet, so there is no ingredient list to
              judge.
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
          <Text style={{ fontSize: TYPE.caption, lineHeight: 17, color: MUTED_FAINT }}>
            Based on your skin profile and public ingredient data - not medical
            advice. Formulas change and label data can be out of date, so check
            the packaging for anything that matters.
          </Text>
        </View>

      </ScrollView>

      {/* Thumb zone, for a product with no formula: the action that supplies one.
          With a formula the ingredients sheet sits here instead. The heart is in
          the header. */}
      {total === 0 && canPhotographLabelFor(product.barcode) ? (
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 20,
          paddingTop: 12,
          // Was a bare 32 — enough on most iPhones, not guaranteed on Android's
          // gesture bar/nav bar. Grows to clear whatever the device actually
          // reserves at the bottom, same pattern (tabs)/index.tsx already uses.
          paddingBottom: Math.max(32, insets.bottom + 12),
          borderTopWidth: 1,
          borderTopColor: BORDER_INACTIVE,
          backgroundColor: CANVAS,
        }}
      >
        <View style={{ flexDirection: "row", gap: 12, justifyContent: "center" }}>
          {/* Two different CTAs, because there are two different situations.

              With a formula, the action is to read it.

              Without one, this screen used to offer nothing at all. That was
              a deliberate correction of something worse — the old
              "Photograph the ingredients" button opened the *barcode
              scanner* for a product already matched and on screen, which
              made no sense — but it left a dead end: a product we recognise,
              with nothing to judge, and no way to supply what is missing.
              UPCitemdb creates exactly these rows, they count as successful
              lookups, and this screen opens on them.

              The route that does make sense is the label camera, carrying
              this product's barcode so the formula is written back against
              the row that already exists rather than minting a second one.
              The backend has always supported that; only the way in was
              missing.

              Guarded on the barcode's shape via `canPhotographLabelFor`,
              which encodes what `label-ocr` accepts — offering a button that
              can only 400 after someone has framed and taken a photo is
              worse than offering none. */}
          {canPhotographLabelFor(product.barcode) ? (
            <PrimaryButton
              tone="cta"
              size={56}
              style={{ flex: 1 }}
              label="Photograph the label"
              onPress={() =>
                router.push({
                  pathname: "/scan-label",
                  params: { barcode: product.barcode },
                })
              }
            />
          ) : null}

        </View>
      </View>
      ) : total > 0 ? (
        <IngredientsSheet product={product} match={match} />
      ) : null}
    </View>
  );
}
