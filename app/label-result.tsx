import { router, useLocalSearchParams } from "expo-router";

import { track } from "@/lib/analytics";
import { photoScannerHref } from "@/lib/open-scanner";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IngredientsSheet, ingredientsSheetPeek, type IngredientsSheetHandle } from "@/components/IngredientsSheet";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RiskCards } from "@/components/RiskCards";
import { ScoreRing } from "@/components/ScoreRing";
import { ContextNudgesSection, ExplanationLine, PairingSection, PregnancySection, ProfileArrow, ReasonLine, panelFor } from "@/components/VerdictExplanation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ReadingScale, Text, useLargeText, useRingScale } from "@/components/Text";
import { resolveIngredientNames } from "@/data/api";
import type { Ingredient } from "@/data/types";
import { pairingNotesFor } from "@/lib/active-pairings";
import { goalNudgesFor, nudgesFor } from "@/lib/context-nudges";
import { confidenceLabel, isLowCoverage, matchProduct, scoreExplanation, verdictHeadline } from "@/lib/matching";
import { clearLabelRead, heldLabelRead, type HeldLabel } from "@/lib/pending-label";
import { isVerified } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";
import { CANVAS, FONT_SCALE, INK, MUTED, SPACE, TYPE } from "@/lib/tokens";
import { barcodeParam as barcodeParamOf } from "@/lib/route-params";

/**
 * The verdict from a photographed label alone — score, reasons, confidence,
 * the parsed list — with no product name or barcode required first (issue
 * #214). Naming and adding the product to the shared catalogue is offered
 * here as a follow-up, never a gate in front of the answer.
 *
 * Reads the same held list `app/add-product.tsx` does (`lib/pending-label`):
 * this screen is where every successful label read lands now, and
 * add-product is reached from the button below, not the other way round.
 */
export default function LabelResult() {
  // From a link, so only a real barcode is kept (#29).
  const barcodeParam = barcodeParamOf(useLocalSearchParams<{ barcode?: string }>().barcode);
  const [read] = useState(heldLabelRead);

  if (!read) return <NothingToShow />;

  return <Verdict read={read} barcode={barcodeParam ?? read.barcode} />;
}

function NothingToShow() {
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: SPACE.block, paddingHorizontal: SPACE.gutter }}>
        <Text style={{ textAlign: "center", fontSize: TYPE.body, color: MUTED }}>
          There&apos;s no ingredient list to show. Scan a product and photograph its ingredients to start.
        </Text>
        <PrimaryButton size={56} label="Back to the scanner" onPress={() => router.back()} />
      </View>
    </View>
  );
}

/**
 * Photographing a label again after a refusal or an unrecognised read
 * (`clearLabelRead` first, same as `app/add-product.tsx`'s own retake) — the
 * only way forward when the formula couldn't be scored at all. Back to the
 * scanner in Photo mode for the same barcode (#204): `dismissTo` closes this
 * screen onto the scanner underneath, or opens one if there isn't.
 */
function retake(barcode?: string) {
  clearLabelRead();
  router.dismissTo(photoScannerHref({ barcode }));
}

function Verdict({ read, barcode }: { read: HeldLabel; barcode?: string }) {
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const sheetRef = useRef<IngredientsSheetHandle>(null);
  // Past the ordinary text ceiling the verdict's words no longer fit beside
  // the score ring, so the ring goes above them (#334).
  const largeText = useLargeText();
  const ringScale = useRingScale();

  useEffect(() => track("verdict_viewed", { path: "label" }), []);

  useEffect(() => {
    let cancelled = false;
    // Never strict: a lookup outage degrades to unverified stubs (the same
    // thing `resolveIngredientNames` always does for an unrecognised name),
    // which reads as low confidence rather than an error screen for
    // something the user can't fix by retrying — no retry button needed.
    resolveIngredientNames(read.ingredients).then((resolved) => {
      if (!cancelled) setIngredients(resolved);
    });
    return () => {
      cancelled = true;
    };
    // `read.ingredients` is the same array for the life of this screen (held
    // in `lib/pending-label` until cleared), so this runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No id, no name, no brand: `matchProduct` only ever reads `.type` and
  // `.ingredients` (see its own `Pick<...>` signature), and #214's decision 2
  // is explicit that this reads as `type: "unknown"` rather than guessing one
  // from the label text — an unnamed read must never outscore the same
  // product once it's actually saved with a real type.
  const product = useMemo(
    () => ({ id: "", type: "unknown" as const, ingredients: ingredients ?? [], fetchedAt: undefined }),
    [ingredients]
  );

  if (ingredients === null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
        <ActivityIndicator color={INK} />
      </View>
    );
  }

  const match = matchProduct(product, profile);
  const panel = panelFor(match.verdict);
  const total = product.ingredients.length;
  const recognised = product.ingredients.filter(isVerified).length;
  const helps = match.reasons.filter((r) => r.effect > 0).slice(0, 3);
  const against = match.reasons.filter((r) => r.effect < 0).slice(0, 3);
  const scoreLines = scoreExplanation(match);
  const confidence = confidenceLabel(match.confidence);
  // Derived independently of `match.unknownReason`, not read from it:
  // `computeMatch` checks `isPersonalized` before coverage and refuses
  // "not_personalized" unconditionally, so with no profile set
  // `unknownReason` is never "low_coverage" no matter how bad the read was —
  // found in review on this PR. `isLowCoverage` (`lib/matching.ts`) answers
  // the coverage question on its own, so an unreadable read is refused
  // whether or not a profile exists.
  //
  // #185/#201: a Korean- or Japanese-only label now reaches this lookup
  // instead of being discarded, but `ingredient_synonyms` has no Korean names
  // yet (#201 is not in the queue) — so it parses, resolves nothing, and
  // lands here exactly like any other unreadable formula. That is the honest
  // state today; the copy below says so without implying a bad photo.
  const lowCoverage = isLowCoverage(product.ingredients);
  const needsProfile = !lowCoverage && match.unknownReason === "not_personalized";
  const sheetPeek = total > 0 ? ingredientsSheetPeek(insets.bottom) : 0;

  const scoreRing = <ScoreRing score={match.score} size={82 * ringScale} label="/100" tone={match.verdict} />;

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader title="Your match" />
      <ScrollView
        contentContainerStyle={{
          gap: SPACE.block,
          paddingTop: SPACE.text,
          paddingBottom: total > 0 ? sheetPeek + SPACE.block : 200,
          paddingHorizontal: SPACE.gutter,
        }}
      >
        {/* The reading part of the screen: its text follows the phone's text
            size all the way up (#334). The header and the ingredients sheet
            keep the ordinary ceiling. */}
        <ReadingScale>
        <Text style={{ fontSize: TYPE.caption, color: MUTED }}>
          {total > 0 ? `${total} ingredients read` : "Nothing was read"}
        </Text>

        <View
          className="rounded-card border"
          style={{ backgroundColor: panel.bg, borderColor: panel.border, overflow: "hidden" }}
        >
          <Pressable
            disabled={!needsProfile}
            onPress={() => router.push({ pathname: "/skin-profile", params: { returnTo: "product" } })}
            accessibilityRole={needsProfile ? "button" : undefined}
            accessibilityLabel={needsProfile ? "Open your skin profile to get your score" : undefined}
            className={`${largeText ? "items-start" : "flex-row items-center"} active:opacity-70`}
            style={{ gap: 20, paddingHorizontal: 20, paddingVertical: 22 }}
          >
            {/* Stacked, the arrow sits level with the ring rather than on a line of
                its own under the words (#334). */}
            {largeText && needsProfile ? (
              <View className="flex-row items-center justify-between self-stretch">
                {scoreRing}
                <ProfileArrow />
              </View>
            ) : (
              scoreRing
            )}
            <View className={largeText ? "gap-1.5 self-stretch" : "flex-1 gap-1.5 pr-6"}>
              <Text
                // Follows the phone as far as body text does, so at the largest sizes
                // the verdict still stands a step above the sentence under it (#334).
                maxFontSizeMultiplier={FONT_SCALE.reading}
                style={{
                  fontFamily: "PlayfairDisplay_500Medium",
                  fontSize: TYPE.title,
                  lineHeight: 23,
                  letterSpacing: -0.3,
                  color: panel.ink,
                }}
              >
                {lowCoverage ? "Couldn't score this one" : panel.label}
              </Text>
              <Text style={{ fontSize: TYPE.body, lineHeight: 22, color: INK }}>
                {lowCoverage
                  ? "We read this list, but don't recognise enough of these ingredient names yet."
                  : verdictHeadline(match)}
              </Text>
            </View>
            {needsProfile && !largeText ? <ProfileArrow /> : null}
          </Pressable>

          {/* Unlike `product/[id].tsx`, this is not behind a "Why this
              score" toggle: the whole point of this screen is the full
              verdict on first look, not a teaser someone already trusts. */}
          {!lowCoverage && (scoreLines.length > 0 || helps.length > 0 || against.length > 0) ? (
            <View
              style={{
                paddingHorizontal: 20,
                paddingBottom: 18,
                paddingTop: 14,
                gap: 14,
                borderTopWidth: 1,
                borderTopColor: panel.border,
              }}
            >
              <View style={{ gap: 10 }}>
                {scoreLines.map((line) => (
                  <ExplanationLine key={`${line.direction}:${line.label}`} {...line} />
                ))}
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
        </View>

        {/* Renders regardless of lowCoverage: contraindications runs before
            the low-coverage refusal (#187), so a pregnant user photographing
            an unreadable formula still gets warned — and a context nudge
            (#234) or pairing note (#233) is still true of whatever names
            were read. */}
        <View style={{ paddingHorizontal: SPACE.gutter, gap: SPACE.block }}>
          <PregnancySection warnings={match.warnings} />
          <ContextNudgesSection
            nudges={[
              ...nudgesFor(product.ingredients, product.type),
              ...goalNudgesFor(product.ingredients, profile.concerns, product.type),
            ]}
          />
          <PairingSection notes={pairingNotesFor(product.ingredients)} />
        </View>

        {lowCoverage ? (
          <PrimaryButton size={52} label="Retake the photo" onPress={() => retake(barcode)} />
        ) : (
          <>
            {/* RiskCards brings its own gutter, as on the product page; inside
                this already-padded scroll view that doubled it, and the
                narrower cards cut "Pore-clogging risk" off (#294). */}
            <View style={{ marginHorizontal: -SPACE.gutter }}>
              <RiskCards
                product={product}
                match={match}
                onIrritationPress={() => sheetRef.current?.open()}
                onPorePress={() => sheetRef.current?.open()}
              />
            </View>
            <PrimaryButton
              size={56}
              label="Name and add this product"
              onPress={() => router.push({ pathname: "/add-product", params: barcode ? { barcode } : {} })}
            />
          </>
        )}
        </ReadingScale>
      </ScrollView>

      {!lowCoverage && total > 0 ? <IngredientsSheet ref={sheetRef} product={product} match={match} /> : null}
    </View>
  );
}
