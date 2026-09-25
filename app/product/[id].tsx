import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { ActivityIndicator, Pressable, ScrollView, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";

import { PrimaryButton } from "@/components/PrimaryButton";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { IngredientsSheet, ingredientsSheetPeek } from "@/components/IngredientsSheet";
import { PopOnToggle } from "@/components/PopOnToggle";
import { RiskCards } from "@/components/RiskCards";
import { ScoreRing } from "@/components/ScoreRing";
import { ContextNudgesSection, ExplanationLine, PairingSection, PregnancySection, ReasonLine, panelFor } from "@/components/VerdictExplanation";
import { HeartIcon } from "@/components/icons";
import { ScreenHeader } from "@/components/ScreenHeader";
import { failureMessage, fetchProduct, peekProducts, type FetchFailure } from "@/data/api";
import { PRODUCT_TYPE_LABEL, type ProductWithIngredients } from "@/data/types";
import { pairingNotesFor } from "@/lib/active-pairings";
import { goalNudgesFor, nudgesFor } from "@/lib/context-nudges";
import { confidenceLabel, matchProduct, scoreExplanation, verdictHeadline } from "@/lib/matching";
import { relativeTime } from "@/lib/format";
import { openScanner } from "@/lib/genie";
import { productPictureSize } from "@/lib/product-layout";
import { isPersonalized } from "@/lib/profile";
import { saveOrAskToSignIn } from "@/lib/save-gate";
import { FirstPageMoment } from "@/components/FirstPageMoment";
import { ProductNote } from "@/components/ProductNote";
import { track } from "@/lib/analytics";
import { historyWarningCount, isVerified } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";
import { CANVAS, INK, MUTED, MUTED_FAINT, SPACE, TOUCH_TARGET, TYPE, VERDICT, WARN } from "@/lib/tokens";

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
/** The product picture: how small and how large it may get, and its size until the screen is measured. */
const PICTURE_MIN = 64;
const PICTURE_MAX = 150;
const PICTURE_DEFAULT = 120;

// panelFor / ReasonLine / ExplanationLine now live in
// components/VerdictExplanation.tsx, shared with app/label-result.tsx (#214).

// See `staleNotice`.
const STALE_AFTER_MS = 182 * 24 * 60 * 60 * 1000;

export default function ProductScreen() {
  const insets = useSafeAreaInsets();
  // `from` says how the person got here, for the funnel (#225) only: the
  // scanner and the label flow set it, and anything else is browsing.
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  // Seeded from the catalogue cache so a product already in memory paints on
  // the first frame instead of a spinner — the same `peekProducts` seam
  // `app/(tabs)/browse.tsx` uses for a warm start.
  const [product, setProduct] = useState<ProductWithIngredients | null>(() =>
    peekProducts("all")?.find((p) => p.id === id) ?? null,
  );
  const [showWhy, setShowWhy] = useState(false);
  // Measured, so the bottle, name and cards fill the screen exactly down to where
  // the ingredients sheet begins: the screen's height and the height of everything
  // under the picture decide how big the picture can be.
  const [viewportH, setViewportH] = useState(0);
  const [restH, setRestH] = useState(0);
  const [loading, setLoading] = useState(() => !product);
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
   *
   * Seeded to `id` when `product` itself was seeded from the cache above —
   * otherwise a failed first fetch would read as "a different id's product
   * is still on screen" and wipe out the very product that skipped the
   * spinner.
   */
  const loadedFor = useRef<string | null>(product ? id : null);

  // Pinned at mount for the same reason the ingredient screen pins its own:
  // `react-hooks/purity` flags `Date.now()` during render.
  const [renderedAt] = useState(() => Date.now());

  const profile = useAppStore((s) => s.profile);
  const savedProducts = useAppStore((s) => s.savedProducts);
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const saveProduct = useAppStore((s) => s.saveProduct);
  const setNote = useAppStore((s) => s.setNote);
  const recordView = useAppStore((s) => s.recordView);
  const fillInViewScore = useAppStore((s) => s.fillInViewScore);
  const saved = savedProducts.some((p) => p.id === id);
  const loggedId = useRef<string | null>(null);
  /**
   * Which id `fetchProduct` has actually confirmed still exists, distinct
   * from `loadedFor` — that ref is seeded at mount for a cache hit so the
   * *screen* doesn't flash a spinner, but the view-history log below must
   * not trust a possibly-stale cached row until the network has actually
   * confirmed it. Only set on a successful fetch, never at the cache seed.
   *
   * State, not a ref: for a cache hit that was already fresh, `fetchProduct`
   * resolves with the same object already in `product`, so `setProduct`
   * is a no-op render-wise — a ref written in that same branch would never
   * be seen by the logging effect below, since nothing would re-run it.
   */
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // `loading` starts true for the initial mount, but this effect also
    // re-runs when `id` changes while the screen stays mounted — without
    // resetting it here too, the previous product stays on screen while
    // the new one fetches. Skipped when `product` was already seeded from
    // the cache for this exact id: showing the spinner over content that's
    // already correct is the exact flash seeding was added to avoid — the
    // fetch below still runs, silently revalidating behind it.
    if (!(product && loadedFor.current === id)) setLoading(true);
    setFailure(null);
    fetchProduct(id)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setProduct(result.value);
          loadedFor.current = id;
          setConfirmedFor(id);
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
    // `product` is read deliberately, not as a dependency: it's checked only
    // to decide whether *this run* of the effect should show the spinner,
    // not to decide whether the effect re-runs — re-running on every
    // `setProduct` inside it would refetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, retryKey]);

  // Opening a product logs it, so "have I already checked this?" is answerable
  // without the user having had the foresight to save it. Keyed on the product
  // alone and guarded by a ref: reading the profile through `getState` keeps a
  // later profile edit from re-firing this and inflating the view count.
  //
  // Gated on `confirmedFor`, not just `product`: a cache-seeded product can
  // be up to the catalogue's staleness window old, so this waits for
  // `fetchProduct` to actually confirm the id still exists — and with its
  // current formula — before it's worth a history entry. Otherwise a stale
  // score got logged before the fresh one arrived, and `loggedId` (below)
  // would then block the corrected score from ever being recorded; a
  // product deleted in the interval would log a view for it anyway.
  useEffect(() => {
    if (!product || confirmedFor !== product.id || loggedId.current === product.id) return;
    loggedId.current = product.id;
    const { score, warnings } = matchProduct(product, useAppStore.getState().profile);
    // historyWarningCount, not irritationWarnings (#187 found in review) —
    // see lib/safety.ts for why the two must differ.
    recordView({ id: product.id, known: true, score, warnings: historyWarningCount(warnings) });
    track("verdict_viewed", { path: from === "barcode" || from === "label" ? from : "browse" });
  }, [product, confirmedFor, recordView, from]);

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
    fillInViewScore(product.id, { score, warnings: historyWarningCount(warnings) });
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
          <PrimaryButton tone="cta" size={52} label="Scan another" onPress={openScanner} />
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
  const scoreLines = scoreExplanation(match);
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

  const needsProfile = !isPersonalized(profile);
  const sheetPeek = total > 0 ? ingredientsSheetPeek(insets.bottom) : 0;
  const pictureSize =
    total > 0
      ? productPictureSize({
          viewport: viewportH,
          rest: restH,
          // Top padding, the sheet's peek and the gap under the content, and the gap under the picture.
          reserved: SPACE.text + sheetPeek + SPACE.block + SPACE.block,
          min: PICTURE_MIN,
          max: PICTURE_MAX,
          fallback: PICTURE_DEFAULT,
        })
      : PICTURE_DEFAULT;

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 22 }}>
            <Pressable
              // Removing never asks; adding asks a guest to sign in first,
              // and the save completes itself once they have (#221).
              onPress={() =>
                saved
                  ? toggleSaved(product.id)
                  : saveOrAskToSignIn(() => saveProduct(product.id, product.fetchedAt), "product")
              }
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={saved ? "Remove from saved" : "Save"}
              accessibilityState={{ selected: saved }}
            >
              <PopOnToggle active={saved}>
                <HeartIcon size={21} filled={saved} color={saved ? VERDICT.low.solid : undefined} />
              </PopOnToggle>
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

      <FirstPageMoment />

      <ScrollView
        onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
        contentContainerStyle={{
          gap: SPACE.block,
          paddingTop: SPACE.text,
          paddingBottom: total > 0 ? sheetPeek + SPACE.block : 200,
        }}
      >
        {/*
          The bottle on top, its name underneath, then the cards. Its size is
          worked out so all of it ends where the ingredients sheet begins (see
          pictureSize): a shorter screen gets a smaller bottle, not a scroll.
        */}
        <View style={{ alignItems: "center", paddingHorizontal: SPACE.gutter }}>
          <ProductThumbnail product={product} size={pictureSize} radius={20} />
        </View>

        <View
          onLayout={(e) => {
            if (!showWhy) setRestH(e.nativeEvent.layout.height);
          }}
          style={{ gap: SPACE.block }}
        >
        <View style={{ alignItems: "center", gap: SPACE.text, paddingHorizontal: SPACE.gutter }}>
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
            marginHorizontal: SPACE.gutter,
            backgroundColor: panel.bg,
            borderColor: panel.border,
            overflow: "hidden",
          }}
        >
        <Pressable
          disabled={!needsProfile}
          onPress={() => router.push({ pathname: "/skin-profile", params: { returnTo: "product" } })}
          accessibilityRole={needsProfile ? "button" : undefined}
          accessibilityLabel={needsProfile ? "Open your skin profile to get your score" : undefined}
          className="flex-row items-center"
          style={{ gap: 20, paddingHorizontal: 20, paddingVertical: 22 }}
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
          {needsProfile ? <ArrowIcon size={22} color={INK} /> : null}
        </Pressable>

        {/*
          "Why this score", inside the box, closed until it is tapped. The
          verdict-level lines come from the score arithmetic; ingredient-level
          lines provide the evidence underneath them.

          This replaced a stack of weighted bars reading "Barrier support −7 /
          Pore-clogging −6". Those numbers are internal scoring arithmetic —
          a hand-set rule weight, scaled by position in the list and by whether
          the product rinses off — and they were being shown as though they
          measured something. Nobody could read them, which for a screen whose
          job is to answer one question in a shop aisle makes them worse than
          nothing.
        */}
        {scoreLines.length > 0 || helps.length > 0 || against.length > 0 ? (
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
              <ArrowIcon direction={showWhy ? "up" : "down"} size={16} color={INK} />
            </Pressable>

            {showWhy ? (
              <View style={{ paddingHorizontal: 20, paddingBottom: 18, paddingTop: 2, gap: 14 }}>
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
          </>
        ) : null}
        </View>

        <View style={{ paddingHorizontal: SPACE.gutter, gap: SPACE.block }}>
          {/* The person's own note (#228), only for a product on their shelf. */}
          {savedEntry ? <ProductNote note={savedEntry.note} onSave={(note) => setNote(product.id, note)} /> : null}
          <PregnancySection warnings={match.warnings} />
          <ContextNudgesSection
            nudges={[
              ...nudgesFor(product.ingredients, product.type),
              ...goalNudgesFor(product.ingredients, profile.concerns, product.type),
            ]}
          />
          <PairingSection notes={pairingNotesFor(product.ingredients)} />
        </View>

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
              paddingHorizontal: SPACE.gutter,
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
              paddingHorizontal: SPACE.gutter,
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

        </View>
      </ScrollView>

      {total > 0 ? <IngredientsSheet product={product} match={match} /> : null}
    </View>
  );
}
