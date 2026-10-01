import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { FirstPageMoment } from "@/components/FirstPageMoment";
import { HeartIcon } from "@/components/icons";
import { PopOnToggle } from "@/components/PopOnToggle";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProductNote } from "@/components/ProductNote";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { ReportMistakeLink } from "@/components/ReportMistakeLink";
import { ResultTabs } from "@/components/result/ResultTabs";
import { IconCircle } from "@/components/IconCircle";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ReadingScale, Text } from "@/components/Text";
import { failureMessage, fetchProduct, peekProducts, type FetchFailure } from "@/data/api";
import { PRODUCT_TYPE_LABEL, type ProductWithIngredients } from "@/data/types";
import { track } from "@/lib/analytics";
import { relativeTime } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { FROM_FINDER, useScoringProfile } from "@/lib/finder-choices";
import { matchProduct } from "@/lib/matching";
import { openScanner } from "@/lib/open-scanner";
import { productIdParam } from "@/lib/route-params";
import { historyWarningCount } from "@/lib/safety";
import { saveFromTap, useCanJournal } from "@/lib/saving";
import { CANVAS, DISPLAY_FONT, FONT_SCALE, INK, MUTED, MUTED_FAINT, SPACE, TOUCH_TARGET, TYPE, VERDICT, WARN } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";
import NotFound from "@/app/+not-found";

// The design system (design/DESIGN_SYSTEM.md). The buttons on this screen
// are the shared `PrimaryButton` — one component so this screen, browse and
// ingredient detail stop hand-rolling the same button and drifting apart
// (three different corner radii once, across four files).

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
 * The layout is design_handoff_skincare_cards: the product, then a Safety /
 * Skin match switch (`components/result/ResultTabs`). Safety — the risks, any
 * pregnancy or routine note, and the ingredient list — is the same for
 * everyone; Skin match is the score, why, and what it means for this person.
 */

// See `staleNotice`.
const STALE_AFTER_MS = 182 * 24 * 60 * 60 * 1000;

/**
 * The route: the id comes from the URL, so a link can put anything in it. One
 * that can't be a catalogue id is a page that doesn't exist, answered without
 * asking the catalogue (#29).
 */
export default function ProductRoute() {
  // `from` says how the person got here, for the funnel (#225) only: the
  // scanner and the label flow set it, and anything else is browsing.
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const productId = productIdParam(id);
  if (!productId) return <NotFound />;
  return <ProductScreen id={productId} from={from} />;
}

function ProductScreen({ id, from }: { id: string; from?: string }) {
  // Seeded from the catalogue cache so a product already in memory paints on
  // the first frame instead of a spinner — the same `peekProducts` seam
  // `app/(tabs)/browse.tsx` uses for a warm start.
  const [product, setProduct] = useState<ProductWithIngredients | null>(() =>
    peekProducts("all")?.find((p) => p.id === id) ?? null,
  );
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

  // The answers this page scores with: the finder's when opened from its
  // results, so the number matches the row tapped; the skin profile otherwise.
  const profile = useScoringProfile(from);
  // History is the person's own record, so it logs the skin profile's score
  // whichever answers the page is showing.
  const ownProfile = useAppStore((s) => s.profile);
  const savedProducts = useAppStore((s) => s.savedProducts);
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const saveProduct = useAppStore((s) => s.saveProduct);
  const setNote = useAppStore((s) => s.setNote);
  const recordView = useAppStore((s) => s.recordView);
  const fillInViewScore = useAppStore((s) => s.fillInViewScore);
  const saved = savedProducts.some((p) => p.id === id);
  const canJournal = useCanJournal();
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
    const { score, warnings } = matchProduct(product, ownProfile);
    fillInViewScore(product.id, { score, warnings: historyWarningCount(warnings) });
  }, [product, ownProfile, fillInViewScore]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
        {/* Named, so a screen reader says what it is waiting on. */}
        <ActivityIndicator color={INK} accessibilityLabel="Loading the product" />
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
          <Text style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, color: INK }}>
            Couldn&apos;t load this product
          </Text>
          <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>
            {failureMessage(failure)}
          </Text>
          <PrimaryButton label="Try again" onPress={() => setRetryKey((k) => k + 1)} />
          <Pressable
            onPress={() => router.push("/browse")}
            accessibilityRole="link"
            style={{ minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
            className="active:opacity-70"
          >
            <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
              Search the catalogue
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
          <Text style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, color: INK }}>
            Product not found
          </Text>
          <PrimaryButton label="Scan another" onPress={openScanner} />
          {/* "Scan another" assumes a physical bottle in hand, which isn't
              true for everyone who lands here — a stale link, a bookmark to
              a removed product. Same escape hatch the missed-barcode panel
              offers, for the same reason. */}
          <Pressable
            onPress={() => router.push("/browse")}
            accessibilityRole="link"
            style={{ minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
            className="active:opacity-70"
          >
            <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
              Search instead
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const match = matchProduct(product, profile);

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
          <>
            <IconCircle
              // Saves for anyone, signed in or not (#300).
              onPress={() => {
                haptic.tap();
                if (saved) toggleSaved(product.id);
                else saveFromTap(() => saveProduct(product.id, product.fetchedAt), "product");
              }}
              accessibilityLabel={saved ? "Remove from saved" : "Save"}
              accessibilityState={{ selected: saved }}
            >
              <PopOnToggle active={saved}>
                <HeartIcon size={20} filled={saved} color={saved ? VERDICT.low.solid : undefined} />
              </PopOnToggle>
            </IconCircle>
            <IconCircle onPress={share} accessibilityLabel="Share this result">
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"
                  stroke={INK}
                  strokeWidth={1.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </IconCircle>
          </>
        }
      />

      <FirstPageMoment />

      {/* "handled": the note editor's sheet renders inside this scroll view, and
          touches follow the React tree, not the Modal's window. Without it, the
          first tap on "Save note" while typing only closed the keyboard. */}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: SPACE.text }}>
        {/* The reading part of the screen: its text follows the phone's text
            size all the way up (#334). */}
        <ReadingScale>
          <ProductHeader product={product} />
          <ResultTabs
            // A new product starts on Skin match with the full list, not the last
            // one's tab, filter or open sheet (#379 review). The loading spinner
            // between products already remounts this today; the key keeps that
            // true if a cached product ever skips the spinner.
            key={product.id}
            ingredients={product.ingredients}
            type={product.type}
            match={match}
            profile={profile}
            onIngredientPress={(ingredient) =>
              router.push({
                pathname: "/ingredient/[inci]",
                // The ingredient page scores with the same answers as this one.
                params: from === FROM_FINDER ? { inci: ingredient.name, product: product.id, from } : { inci: ingredient.name, product: product.id },
              })
            }
            footer={
              <>
                {/* The person's own note (#228), only for a product on their
                    shelf, and signed in only (#300): see useCanJournal. */}
                {savedEntry && canJournal ? <ProductNote note={savedEntry.note} onSave={(note) => setNote(product.id, note)} /> : null}
                {/* How old the formula is, once old enough to matter, and a
                    confirmed change since it was saved (step 8): WARN, so a
                    trust-relevant claim never reads as furniture. */}
                {staleNotice ? <Text style={{ fontSize: TYPE.label, lineHeight: 17, fontWeight: "600", color: WARN }}>{staleNotice}</Text> : null}
                {formulaChangedNotice ? (
                  <Text style={{ fontSize: TYPE.label, lineHeight: 17, fontWeight: "600", color: WARN }}>{formulaChangedNotice}</Text>
                ) : null}
              </>
            }
            // A wrong name or list gets told to us (#327), under the full list.
            report={<ReportMistakeLink button subject={{ kind: "product", id: product.id, name: product.name, brand: product.brand, barcode: product.barcode }} />}
          />
        </ReadingScale>
      </ScrollView>
    </View>
  );
}

/**
 * The product, as the result's header (v7): its bottle straight on the page,
 * top-aligned, and beside it the brand, the name and the product's type
 * (owner, 29 September 2026: no stock line). An unknown type is left out.
 */
function ProductHeader({ product }: { product: ProductWithIngredients }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16, paddingHorizontal: SPACE.gutter }}>
      <View style={{ width: 80, height: 92, alignItems: "center", justifyContent: "center" }}>
        <ProductThumbnail product={product} size={88} />
      </View>
      <View style={{ flex: 1, gap: 4, paddingTop: 4 }}>
        <Text maxFontSizeMultiplier={FONT_SCALE.ui} style={{ fontSize: TYPE.label, lineHeight: 20, color: MUTED_FAINT }}>
          {product.brand}
        </Text>
        <Text maxFontSizeMultiplier={FONT_SCALE.display} style={{ fontSize: TYPE.title, fontWeight: "600", lineHeight: 25, letterSpacing: -0.2, color: INK }}>
          {product.name}
        </Text>
        {product.type !== "unknown" ? (
          <Text maxFontSizeMultiplier={FONT_SCALE.ui} style={{ fontSize: TYPE.caption, color: MUTED }}>
            {PRODUCT_TYPE_LABEL[product.type]}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
