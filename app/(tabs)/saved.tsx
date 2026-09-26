import { Image } from "expo-image";
import { Link, router, useFocusEffect, useScrollToTop } from "expo-router";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { BottomSheet } from "@/components/BottomSheet";
import { PrimaryButton } from "@/components/PrimaryButton";
import { NotePreview } from "@/components/ProductNote";
import { ProductThumbnail } from "@/components/ProductThumbnail";
// One selected-outline color app-wide — see profile.tsx's own note on why
// this FOR.ME shell token is reused outside its original scope.
import { TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import { TypeChip } from "@/components/TypeChip";
import { canPhotographLabelFor, fetchProductsByIds, resolveIngredientNames } from "@/data/api";
import { unknownIngredient, type Ingredient, type ProductWithIngredients } from "@/data/types";
import { displayIngredientName } from "@/lib/ingredient-name";
import { shelfPairingNotes, type PairingNote } from "@/lib/active-pairings";
import { relativeTime } from "@/lib/format";
import { openScanner } from "@/lib/open-scanner";
import { matchProduct, matchTone } from "@/lib/matching";
import { STEP_LABEL, STEP_ORDER, TYPE_STEP, stepOf, type RoutineStep, type StepGroup } from "@/lib/routine-step";
import { isTabEmpty, type SavedTab } from "@/lib/saved-tabs";
import { isVerified } from "@/lib/safety";
import { useCanJournal, useGuestShelf } from "@/lib/saving";
import { LiftedCard, usePressScale } from "@/components/PressableCard";
import { tabBarClearance } from "@/lib/tab-bar";
import { BORDER_INACTIVE, CANVAS, CHIP_SHADOW, DANGER, FLOATING_SHADOW, INK, MUTED, MUTED_FAINT, RADIUS_SELECTOR, SELECTED, SURFACE, TOUCH_TARGET, TYPE, VERDICT, VERDICT_LABEL, VERDICT_NEUTRAL, WARN } from "@/lib/tokens";
import { useAppStore, type HistoryEntry, type SavedProduct } from "@/store/useAppStore";
import { haptic } from "@/lib/haptics";

type Tab = SavedTab;

// design-watercolor/saved screen background.png, brought down to 1170px wide.
const BACKGROUND_ART = require("@/assets/illustrations/saved-background.jpg");

/**
 * The shelf and the log, on one screen.
 *
 * They look similar but obey different rules, and the difference is the point:
 * saved rows are re-scored live against the current profile, because a shelf
 * should say what you think today. History rows show the score as it stood
 * when you looked - a log that rewrites its own past entries is worse than no
 * log.
 *
 * That distinction survives the verdict colours: a saved row carries both the
 * leading bar and the badge, a history row carries only the bar, tinted by the
 * score it had at the time. The bar is a colour, not a claim about now.
 */
export default function Saved() {
  const insets = useSafeAreaInsets();
  // Tapping the Saved tab while it is already showing scrolls the list on screen
  // back to the top. One ref for all three lists is enough: only one is ever
  // mounted at a time (the empty state replaces them), so it always points at
  // the one the user is looking at.
  const listRef = useRef<ScrollView>(null);
  useScrollToTop(listRef);
  const [tab, setTab] = useState<Tab>("saved");

  const profile = useAppStore((s) => s.profile);
  const savedProducts = useAppStore((s) => s.savedProducts);
  const savedIngredients = useAppStore((s) => s.savedIngredients);
  const history = useAppStore((s) => s.history);
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const setRoutineStep = useAppStore((s) => s.setRoutineStep);
  const restoreSavedProduct = useAppStore((s) => s.restoreSavedProduct);
  const clearHistory = useAppStore((s) => s.clearHistory);
  const clearSavedProducts = useAppStore((s) => s.clearSavedProducts);
  const clearSavedIngredients = useAppStore((s) => s.clearSavedIngredients);
  const removeHistoryEntry = useAppStore((s) => s.removeHistoryEntry);
  const restoreHistoryEntry = useAppStore((s) => s.restoreHistoryEntry);
  const shelfOwner = useAppStore((s) => s.shelfOwner);
  const guest = useGuestShelf();
  const canJournal = useCanJournal();

  // A removed row's own data, held just long enough to put it back — nothing
  // here is written until a timer or a tab switch clears it, so Undo can
  // always restore exactly what was on screen a moment ago rather than
  // re-deriving it from whatever the list looks like by the time it's
  // tapped.
  const [pendingUndo, setUndo] = useState<
    { kind: "saved"; product: SavedProduct; owner: string | null } | { kind: "history"; entry: HistoryEntry } | null
  >(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);
  function showUndo(next: NonNullable<typeof pendingUndo>) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(next);
    undoTimer.current = setTimeout(() => setUndo(null), 4000);
  }
  function dismissUndo() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(null);
  }
  // A removed shelf row belongs to whoever owned the shelf then. If the shelf
  // has changed hands since (signed out, or in), putting it back would hand
  // one person's item to the next shelf, which is carried into an account at
  // sign-in (#300). So the offer goes with the owner; its timer clears it.
  const undo = pendingUndo?.kind === "saved" && pendingUndo.owner !== shelfOwner ? null : pendingUndo;

  // The one irreversible action on this screen (see `clearHistory` below) —
  // gated behind a second tap the same way `profile.tsx`'s erase/discard
  // confirms are, rather than firing on a single tap the way this used to.
  // Reset whenever a segment tap leaves History, so switching tabs and back
  // doesn't strand the confirm mid-air with no reminder of what it was
  // confirming — same reasoning as profile.tsx's own reset, done at the tap
  // that causes it rather than in an effect reacting to it after the fact.
  const [confirmingClear, setConfirmingClear] = useState(false);

  // Routine steps (#227): which group the shelf is narrowed to, and which
  // product's step is being chosen.
  const [stepFilter, setStepFilter] = useState<StepGroup | "all">("all");
  const [pickingStepFor, setPickingStepFor] = useState<string | null>(null);
  // The tab stays mounted while another one is showing, so an armed "Clear it" would
  // still be waiting when the person came back. Leaving the screen disarms all three.
  useFocusEffect(
    useCallback(() => () => setConfirmingClear(false), [])
  );

  // Newest first in both lists. `history` is already ordered by the store.
  const savedIds = useMemo(
    () => [...savedProducts].sort((a, b) => b.savedAt - a.savedAt).map((p) => p.id),
    [savedProducts]
  );
  const knownHistoryIds = useMemo(
    () => history.filter((h) => h.known).map((h) => h.id),
    [history]
  );

  const idsToResolve = useMemo(
    () => [...new Set([...savedIds, ...knownHistoryIds])],
    [savedIds, knownHistoryIds]
  );

  const [byId, setById] = useState<Record<string, ProductWithIngredients> | null>(null);
  // Kept in sync via its own effect, not written during render (the lint
  // rule here is right that a render-time ref write is unsafe) — read from
  // inside the id-resolving effect below without needing `byId` itself as a
  // dependency, which would re-run that effect every time it calls setById.
  const byIdRef = useRef(byId);
  useEffect(() => {
    byIdRef.current = byId;
  });
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Pairings across the shelf (#233), from the products already loaded here —
  // the shelf lives on this device, so this needs no account.
  const shelfNotes = useMemo(
    () => shelfPairingNotes(byId ? savedIds.flatMap((id) => (byId[id] ? [byId[id]] : [])) : []),
    [byId, savedIds]
  );

  /** A saved product's shelf group: the person's step, or the guess from its type. */
  const groupOf = (id: string): StepGroup | null => {
    const product = byId?.[id];
    if (!product) return null;
    return stepOf(product.type, savedProducts.find((p) => p.id === id)?.routineStep);
  };

  // The groups with something in them, and the filter actually applied. A
  // filter whose group has just emptied — its last product removed or moved —
  // falls back to All rather than leaving a blank shelf with the pills gone
  // (#278 review). The pills only show with two groups to choose between, so
  // with fewer there is nothing to filter by either.
  const presentGroups = STEP_ORDER.filter((group) => savedIds.some((id) => groupOf(id) === group));
  const activeFilter = stepFilter !== "all" && presentGroups.length > 1 && presentGroups.includes(stepFilter) ? stepFilter : "all";

  useEffect(() => {
    let cancelled = false;
    setError(false);

    if (idsToResolve.length === 0) {
      setById({});
      return;
    }

    // Removing a saved or history row only ever shrinks this list — the
    // "x" never introduces an id we haven't already resolved — so skip the
    // fetch (and the full-screen spinner this effect used to flash on every
    // single removal) whenever nothing here actually needs fetching.
    const current = byIdRef.current;
    const missing = current ? idsToResolve.filter((id) => !(id in current)) : idsToResolve;
    if (current && missing.length === 0) {
      return;
    }

    fetchProductsByIds(current ? missing : idsToResolve)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(true);
          return;
        }
        // Only reached when the read succeeded, which is what lets the rows
        // below treat a still-unresolved id as "the catalogue does not have
        // this" rather than "we could not ask". See `UnknownRow`.
        setById((prev) => ({
          ...(prev ?? {}),
          ...Object.fromEntries(result.value.map((p) => [p.id, p])),
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [idsToResolve, retryKey]);

  // One empty screen for all three tabs, rendered from a single spot in the
  // tree so React keeps the same instance when the tab changes — only the
  // text (and where the button leads) swaps. Each tab used to render its own,
  // and Ingredients sat behind a loading spinner first, so switching tabs
  // remounted the picture and flashed.
  //
  // Not just `length === 0` for Saved and History — removing the *last* row
  // makes that true immediately, before the four-second Undo window has any
  // chance to show. A pending undo of that kind keeps the list view (now
  // rendering nothing but the bar) on screen instead of jumping straight to
  // the empty state.
  const isEmpty = isTabEmpty(
    tab,
    { saved: savedIds.length, history: history.length, ingredients: savedIngredients.length },
    undo?.kind,
  );

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      {/* The watercolor behind all three tabs (Saved, History, Ingredients). Fills
          the screen and cover-crops to it; decorative, so it takes no touches. */}
      <Image
        source={BACKGROUND_ART}
        contentFit="cover"
        pointerEvents="none"
        accessibilityLabel=""
        style={StyleSheet.absoluteFill}
      />
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 10, paddingBottom: 10 }}>
        <Text style={{ textAlign: "center", fontFamily: "PlayfairDisplay_500Medium", fontSize: 20, color: INK }}>
          Saved
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 14 }}>
        <SegmentButton
          label={savedProducts.length ? `Saved (${savedProducts.length})` : "Saved"}
          active={tab === "saved"}
          onPress={() => {
            setTab("saved");
            setConfirmingClear(false);
          }}
        />
        <SegmentButton
          label={history.length ? `History (${history.length})` : "History"}
          active={tab === "history"}
          onPress={() => {
            setTab("history");
            setConfirmingClear(false);
          }}
        />
        {/* No count in parens here, unlike the two siblings — three segments
            leaves each about a third of the row, and "Ingredients (12)" is
            long enough at that width to risk wrapping inside the pill's
            fixed 48pt height (Code-inferred, not visually verified in this
            environment — kept deliberately short rather than risk it). */}
        <SegmentButton
          label="Ingredients"
          active={tab === "ingredients"}
          onPress={() => {
            setTab("ingredients");
            setConfirmingClear(false);
          }}
        />
      </View>

      {guest && tab !== "history" ? <GuestShelfLine /> : null}

      {isEmpty ? (
        <EmptyState tab={tab} />
      ) : tab === "ingredients" ? (
        <IngredientsTab
          key="ingredients"
          scrollRef={listRef}
          names={savedIngredients}
          footer={
            <ClearAll
              label="Clear ingredients"
              question="Clear all your starred ingredients?"
              confirming={confirmingClear}
              onAsk={() => setConfirmingClear(true)}
              onCancel={() => setConfirmingClear(false)}
              onConfirm={() => {
                setConfirmingClear(false);
                clearSavedIngredients();
              }}
            />
          }
        />
      ) : error ? (
        <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 40, paddingTop: 96 }}>
          <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>
            Couldn&apos;t load your saved products. Check your connection and try again.
          </Text>
          <Pressable onPress={() => setRetryKey((k) => k + 1)} accessibilityRole="button" style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }} className="active:opacity-70">
            <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : byId === null ? (
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 96 }}>
          <ActivityIndicator color={INK} />
        </View>
      ) : tab === "saved" ? (
        // `key` on each list: Saved and History are the same kind of element in the
        // same spot, so without it React reuses one scroll view for both and the
        // scroll position carries over when switching tabs.
        <ScrollView key="saved" ref={listRef} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: tabBarClearance(insets.bottom) }}>
          <StepFilter groups={presentGroups} selected={activeFilter} onSelect={setStepFilter} />
          {savedIds.map((id) => {
            const product = byId[id];
            if (!product) return null;
            if (activeFilter !== "all" && groupOf(id) !== activeFilter) return null;
            const match = matchProduct(product, profile);
            const score = match.score;
            const tone = score === null ? null : matchTone(score);
            const verdict = tone ? VERDICT[tone] : VERDICT_NEUTRAL;
            return (
              <Row
                key={id}
                product={product}
                bar={verdict.solid}
                footer={
                  <StepLine
                    group={groupOf(id)}
                    chosen={savedProducts.find((p) => p.id === id)?.routineStep !== undefined}
                    // Steps, like notes, are signed-in only (#300).
                    onChange={canJournal ? () => setPickingStepFor(id) : undefined}
                  />
                }
                onRemove={() => {
                  const saved = savedProducts.find((p) => p.id === id);
                  toggleSaved(id);
                  if (saved) showUndo({ kind: "saved", product: saved, owner: shelfOwner });
                }}
              >
                {savedProducts.find((p) => p.id === id)?.note ? (
                  // The person's own words, exactly as written (#228).
                  <NotePreview note={savedProducts.find((p) => p.id === id)!.note!} />
                ) : null}
                {tone && score !== null && (
                  <View
                    style={{
                      marginTop: 7,
                      alignSelf: "flex-start",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      backgroundColor: verdict.tint,
                    }}
                  >
                    <Text style={{ fontSize: TYPE.caption, fontWeight: "700", color: verdict.deep }}>
                      {score}%
                    </Text>
                    <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: verdict.deep }}>
                      · {VERDICT_LABEL[match.verdict]}
                    </Text>
                  </View>
                )}
              </Row>
            );
          })}
          {undo?.kind === "saved" && (
            <UndoBar
              label="Removed"
              onUndo={() => {
                if (useAppStore.getState().shelfOwner === undo.owner) restoreSavedProduct(undo.product);
                dismissUndo();
              }}
            />
          )}

          <ShelfPairings notes={shelfNotes} />

          <StepPicker
            productId={pickingStepFor}
            guess={pickingStepFor && byId[pickingStepFor] ? TYPE_STEP[byId[pickingStepFor].type] : null}
            chosen={savedProducts.find((p) => p.id === pickingStepFor)?.routineStep ?? null}
            onPick={(step) => {
              if (pickingStepFor) setRoutineStep(pickingStepFor, step);
              setPickingStepFor(null);
            }}
            onClose={() => setPickingStepFor(null)}
          />

          <ClearAll
            label="Clear saved products"
            question="Clear all your saved products?"
            confirming={confirmingClear}
            onAsk={() => setConfirmingClear(true)}
            onCancel={() => setConfirmingClear(false)}
            onConfirm={() => {
              setConfirmingClear(false);
              dismissUndo();
              clearSavedProducts();
            }}
          />
        </ScrollView>
      ) : (
        <ScrollView key="history" ref={listRef} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: tabBarClearance(insets.bottom) }}>
          {history.map((entry) => {
            const product = entry.known ? byId[entry.id] : undefined;
            // The bar reflects the score this entry carried when it was
            // logged, not a fresh one - re-scoring the log is exactly what
            // this screen refuses to do.
            const snapshotTone = entry.scoreAtView === null ? null : matchTone(entry.scoreAtView);
            const bar = snapshotTone ? VERDICT[snapshotTone].solid : VERDICT_NEUTRAL.solid;
            const removeEntry = () => {
              removeHistoryEntry(entry.id);
              showUndo({ kind: "history", entry });
            };
            return product ? (
              <Row key={entry.id} product={product} bar={bar} onRemove={removeEntry}>
                <HistoryMeta entry={entry} action />
              </Row>
            ) : (
              <UnknownRow key={entry.id} entry={entry} bar={bar} onRemove={removeEntry} />
            );
          })}
          {undo?.kind === "history" && (
            <UndoBar label="Removed" onUndo={() => { restoreHistoryEntry(undo.entry); dismissUndo(); }} />
          )}

          <ClearAll
            label="Clear history"
            question="Clear your whole history?"
            confirming={confirmingClear}
            onAsk={() => setConfirmingClear(true)}
            onCancel={() => setConfirmingClear(false)}
            onConfirm={() => {
              setConfirmingClear(false);
              dismissUndo();
              clearHistory();
            }}
          />
        </ScrollView>
      )}
    </View>
  );
}

// Standard tap height for the three "Clear …" links, not the bare text line.
const CLEAR_TARGET = {
  minHeight: TOUCH_TARGET,
  minWidth: TOUCH_TARGET,
  paddingHorizontal: 12,
  alignItems: "center",
  justifyContent: "center",
} as const;

/** The "Clear …" link at the foot of a list, and its second-tap confirm. One
 *  component so Saved, History and Ingredients wipe the same way. */
function ClearAll({
  label,
  question,
  confirming,
  onAsk,
  onCancel,
  onConfirm,
}: {
  label: string;
  question: string;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return confirming ? (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 12 }}>
      <Text style={{ fontSize: 12.5, color: MUTED }}>{question}</Text>
      <View style={{ flexDirection: "row", gap: 20 }}>
        <Pressable onPress={onCancel} accessibilityRole="button" style={CLEAR_TARGET} className="active:opacity-70">
          <Text style={{ fontSize: 12, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>Keep it</Text>
        </Pressable>
        <Pressable onPress={onConfirm} accessibilityRole="button" style={CLEAR_TARGET} className="active:opacity-70">
          <Text style={{ fontSize: 12, fontWeight: "600", color: DANGER, textDecorationLine: "underline" }}>Clear it</Text>
        </Pressable>
      </View>
    </View>
  ) : (
    <Pressable onPress={onAsk} accessibilityRole="button" style={[CLEAR_TARGET, { alignSelf: "center" }]} className="active:opacity-70">
      <Text style={{ fontSize: 13, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>{label}</Text>
    </Pressable>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      // 48pt inline. It was padding-derived, which put it at roughly 34 -
      // shorter than everything else on the screen and the first thing you
      // touch on it.
      style={{
        flex: 1,
        height: 48,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: RADIUS_SELECTOR,
        borderWidth: active ? 1.5 : 1,
        borderColor: active ? TERRACOTTA : BORDER_INACTIVE,
        backgroundColor: active ? SELECTED : CANVAS,
        ...CHIP_SHADOW,
      }}
      className="active:opacity-70"
    >
      <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: "600", color: active ? INK : MUTED }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A white card with the verdict down its leading edge — same object as a
 *  browse row (`components/ProductRow.tsx`), laid out for a taller shelf card.
 *  The whole card is a link to the product; the "x" is a second, nested
 *  `Pressable` that captures its own tap without also triggering the link
 *  underneath — the same nesting this file's old "Remove" text link already
 *  relied on. */
function Row({
  product,
  bar,
  onRemove,
  children,
  footer,
}: {
  product: ProductWithIngredients;
  bar: string;
  onRemove: () => void;
  children: ReactNode;
  /** Controls under the card's link, outside it — see the note below on why. */
  footer?: ReactNode;
}) {
  const [scale, press] = usePressScale();
  return (
    // The card's chrome lives on a plain View, not the Link/Pressable
    // itself — `Link asChild` renders an actual `<a>` on web, and a click
    // anywhere inside an anchor triggers its navigation, `stopPropagation`
    // on a nested Pressable notwithstanding (confirmed: it doesn't stop the
    // anchor's own default action). Keeping `RemoveButton` as a sibling
    // outside the anchor, not a descendant of it, is the only fix that
    // actually holds on web.
    <LiftedCard scale={scale} backgroundColor={SURFACE}>
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: BORDER_INACTIVE, overflow: "hidden" }}>
      <Link href={`/product/${product.id}`} asChild>
        <Pressable style={{ flexDirection: "row" }} {...press}>
          <View style={{ width: 4, alignSelf: "stretch", backgroundColor: bar }} />
          <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 13, padding: 13 }}>
            <ProductThumbnail product={product} size={56} radius={14} />
            <View style={{ flex: 1, paddingRight: 28 }}>
              <Text style={{ fontSize: TYPE.caption, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.7, color: MUTED_FAINT }}>
                {product.brand}
              </Text>
              <Text
                style={{ marginTop: 2, fontSize: 13.5, fontWeight: "500", lineHeight: 18, color: INK }}
                numberOfLines={2}
              >
                {product.name}
              </Text>
              {children}
            </View>
          </View>
        </Pressable>
      </Link>
      {footer}

      <RemoveButton onPress={onRemove} />
    </View>
    </LiftedCard>
  );
}

/** The "x" in the top-right corner of every Saved/History card — unsaves a
 *  shelf row, or drops one entry from the log (see the two different store
 *  actions each call site passes in). Rendered as a sibling of `Row`'s
 *  `Link`, never nested inside it — see that component's own comment for
 *  why. */
function RemoveButton({ onPress }: { onPress: () => void }) {
  // A soft terracotta badge with a rounded, slightly-imperfect hand-drawn
  // stroke — as close to the onboarding/quiz's warm watercolor language as
  // a vector icon can get. It's still a drawn line, not painted artwork —
  // see the note on this in chat; that needs an actual image asset, which
  // isn't something this pass can generate.
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Remove"
      style={{
        position: "absolute",
        top: 6,
        right: 6,
        width: 30,
        height: 30,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 15,
        backgroundColor: SELECTED,
      }}
      className="active:opacity-70"
    >
      <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
        <Path
          d="M6.5 6.5c3 3.2 8 8.2 11 11M17.5 6.5c-3 3.2-8 8.2-11 11"
          stroke={TERRACOTTA}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </Svg>
    </Pressable>
  );
}

/**
 * "Worth knowing about your shelf" — saved products whose actives tend to add
 * up to more irritation used together (#233). The same heading-then-lines
 * treatment as the result screen's context sections, on a card so it reads
 * over the background. Its own line rather than `ExplanationLine`, which
 * capitalises every word of its label — wrong for a product's own name.
 */
function ShelfPairings({ notes }: { notes: PairingNote[] }) {
  if (notes.length === 0) return null;
  return (
    <View
      style={{
        gap: 12,
        marginTop: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER_INACTIVE,
        backgroundColor: SURFACE,
        padding: 16,
      }}
    >
      <Text accessibilityRole="header" style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>
        Worth knowing about your shelf
      </Text>
      {notes.map((note) => (
        <View key={note.id} style={{ gap: 1 }}>
          <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>{note.label}</Text>
          <Text style={{ fontSize: TYPE.label, lineHeight: 19, color: MUTED }}>{note.text}</Text>
        </View>
      ))}
    </View>
  );
}

/** A brief "Removed — Undo" strip after a per-row remove, so a mis-tap or a
 *  change of mind has a way back before the 4s window in `showUndo` closes
 *  it. Sits at the end of whichever list just changed, not a floating
 *  toast — the two lists never show a removal at the same time, so there is
 *  never more than one of these on screen. */
function UndoBar({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: BORDER_INACTIVE,
        backgroundColor: SURFACE,
        paddingHorizontal: 16,
        paddingVertical: 12,
        ...FLOATING_SHADOW,
      }}
    >
      <Text style={{ fontSize: 13, color: MUTED }}>{label}</Text>
      <Pressable onPress={onUndo} accessibilityRole="button" style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }} className="active:opacity-70">
        <Text style={{ fontSize: 13, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
          Undo
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * The snapshot verdict, set deliberately quieter than the saved badge so it
 * never reads as the product's current score.
 */
function HistoryMeta({ entry, action = false }: { entry: HistoryEntry; action?: boolean }) {
  return (
    <View style={{ marginTop: 6, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
      <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 }}>
        <Text style={{ fontSize: TYPE.caption, color: MUTED }}>{relativeTime(entry.lastSeenAt)}</Text>
        {entry.seenCount > 1 && (
          <Text style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>
            · checked {entry.seenCount} times
          </Text>
        )}
        {entry.scoreAtView !== null && (
          <Text style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>
            · {entry.scoreAtView}% then
          </Text>
        )}
        {entry.warningsAtView > 0 && (
          <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: WARN }}>
            · {entry.warningsAtView} flagged
          </Text>
        )}
      </View>
      {/* The row is already a link; this is the affordance that says so, and
          the design puts one on every history row. */}
      {action ? (
        <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: INK }}>View</Text>
      ) : null}
    </View>
  );
}

/**
 * A history entry with no product to show. Two different situations, and this
 * row used to state the first one for both.
 *
 * `known: false` — a scanned barcode the cascade found nothing for. "Not in our
 * catalogue" is exactly right, and the id printed beside it is a real barcode
 * the user can compare against the bottle.
 *
 * `known: true` — a catalogue product that did not come back. The id here is an
 * internal one (`obf-8801234567890`, `hanbang-rice-serum`), and printing it
 * under "Scanned · we don't have this product" made two false claims at once: that
 * the user had scanned that string, and that the product was never in the
 * catalogue. It was — they opened it, which is why it is in their history.
 * This branch is only reached after a *successful* read (a failed one puts the
 * whole tab into its error state), so "no longer" is established rather than
 * guessed.
 */
function UnknownRow({ entry, bar, onRemove }: { entry: HistoryEntry; bar: string; onRemove: () => void }) {
  // Both halves matter: a missed QR scan is `known: false` too, and still not
  // something label-ocr can attach a photo to.
  const canPhotographLabel = !entry.known && canPhotographLabelFor(entry.id);

  return (
    <LiftedCard backgroundColor={SURFACE}>
    <View style={{ flexDirection: "row", borderRadius: 16, borderWidth: 1, borderColor: BORDER_INACTIVE, overflow: "hidden" }}>
      <View style={{ width: 4, alignSelf: "stretch", backgroundColor: bar }} />
      <View style={{ flex: 1, padding: 13, paddingRight: 36 }}>
        <Text style={{ fontSize: TYPE.caption, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.7, color: MUTED_FAINT }}>
          {entry.known ? "Opened earlier · no longer in our catalogue" : "Scanned · we don't have this product"}
        </Text>
        {/* Only the barcode is shown, and only because it is the user's own
            evidence — it matches the digits printed on the bottle, so they can
            check the scan landed on the right item. An internal product id
            (`obf-8801234567890`) is ours, not theirs: there is nothing they can
            do with it and nowhere they can take it, so the row is better
            without it. The timestamp below is what actually distinguishes one
            of these rows from another. */}
        {!entry.known && (
          <Text style={{ marginTop: 2, fontSize: 14, color: INK }}>{entry.id}</Text>
        )}
        <HistoryMeta entry={entry} />

        {/*
          The way out of this row. The scanner already offers it at the moment
          of the miss — "Photograph the label and we'll add it", pushing
          /scan-label with the barcode attached — but that offer expired the
          moment the miss became history, leaving a bare 13-digit number whose
          only action was Remove. Someone who scans four misses in a shop and
          opens this screen at home could delete them and nothing else.

          `HistoryMeta`'s own action slot is not the place for it: that renders
          plain text, because a known row is wrapped in a Link and the whole
          row is the target. Nothing here is a link — there is no product to
          open — so this has to be a control of its own.

          `hitSlop` rather than a 44pt minHeight: the target has to clear 44
          (Apple HIG / WCAG 2.2 AA), but spending that much vertical space
          inside a compact list row would push the other rows off screen.
        */}
        {canPhotographLabel && (
          <Pressable
            onPress={() => router.push({ pathname: "/scan-label", params: { barcode: entry.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Photograph the ingredients list for barcode ${entry.id}`}
            hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
            style={{ marginTop: 8, alignSelf: "flex-start" }}
            className="active:opacity-70"
          >
            <Text
              style={{
                fontSize: TYPE.caption,
                fontWeight: "600",
                color: INK,
                textDecorationLine: "underline",
              }}
            >
              Photograph the ingredients list
            </Text>
          </Pressable>
        )}
      </View>

      <RemoveButton onPress={onRemove} />
    </View>
    </LiftedCard>
  );
}

// One picture for each tab's empty state, with its own proportions (width / height)
// so `contain` never letterboxes it.
const EMPTY_ART = {
  saved: { source: require("@/assets/illustrations/saved-empty-shelf.png"), aspect: 1400 / 810 },
  history: { source: require("@/assets/illustrations/history-empty.png"), aspect: 1400 / 927 },
  ingredients: { source: require("@/assets/illustrations/ingredients-empty.png"), aspect: 1400 / 855 },
} as const;

type EmptyCopy = { title: string; body: string; actionLabel: string; actionHref: "/scanner" | "/browse" };

const EMPTY_COPY: Record<Tab, EmptyCopy> = {
  saved: {
    title: "No products saved yet",
    body: "Tap Save on any product and it will wait for you here - including next time you open the app.",
    actionLabel: "Scan a product",
    actionHref: "/scanner",
  },
  history: {
    title: "No history yet",
    body: "Every product you open or scan is logged here automatically, so you can tell at a glance whether you have already checked something.",
    actionLabel: "Scan a product",
    actionHref: "/scanner",
  },
  ingredients: {
    title: "No starred ingredients yet",
    body: "Open a product, tap an ingredient, then tap its star to keep it here.",
    actionLabel: "Search products",
    actionHref: "/browse",
  },
};

// Wider than the text block under it (which has 40 either side): these are wide pictures.
const EMPTY_ART_WIDTH = 340;
// The picture's box is as tall as the tallest of them, and each is centred in it, so
// the text under the picture starts at the same place on every tab.
const EMPTY_ART_HEIGHT = EMPTY_ART_WIDTH / Math.min(...Object.values(EMPTY_ART).map((art) => art.aspect));

// How long the pictures cross-fade when the tab changes.
const EMPTY_FADE_MS = 300;
const EMPTY_TABS = Object.keys(EMPTY_ART) as Tab[];
// How the room left over on an empty tab is split above and below its content.
const EMPTY_SPACE_ABOVE = 0.4;
const EMPTY_SPACE_BELOW = 0.6;

/**
 * Whether the person has asked their phone for less motion. `null` until the phone has
 * answered: callers treat that as "reduce", so no fade plays on a guess.
 */
function useReduceMotion(): boolean | null {
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => live && setReduce(enabled))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return reduce;
}

/**
 * What an empty tab shows. It stays mounted while the tab changes between the
 * three empty tabs, so the picture can fade rather than swap: the three pictures
 * sit on top of each other and cross-fade over EMPTY_FADE_MS. Only the picture
 * moves: the title, the sentence and the button change in place at once, so they
 * stay solid on the screen.
 */
function EmptyState({ tab }: { tab: Tab }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [artOpacity] = useState(
    () => Object.fromEntries(EMPTY_TABS.map((t) => [t, new Animated.Value(t === tab ? 1 : 0)])) as Record<Tab, Animated.Value>
  );
  const previous = useRef<Tab>(tab);

  useEffect(() => {
    if (previous.current === tab) return;
    previous.current = tab;

    const useNativeDriver = Platform.OS !== "web";
    const duration = reduceMotion !== false ? 0 : EMPTY_FADE_MS;
    const timing = (value: Animated.Value, toValue: number, ms: number) =>
      Animated.timing(value, { toValue, duration: ms, easing: Easing.inOut(Easing.cubic), useNativeDriver });

    const pictures = Animated.parallel(EMPTY_TABS.map((t) => timing(artOpacity[t], t === tab ? 1 : 0, duration)));
    pictures.start();
    return () => pictures.stop();
  }, [tab, artOpacity, reduceMotion]);

  const { title, body, actionLabel, actionHref } = EMPTY_COPY[tab];

  return (
    // Asymmetric flex spacers (0.4/0.6), not `justifyContent: "center"" —
    // a true center split the leftover room evenly above and below, which
    // read as too much empty air above the art specifically. This keeps
    // the block off-center toward the top by a fixed ratio instead, so it
    // scales the same way on any screen height.
    // Scrolls only when the art, copy and button do not fit (a short phone, large
    // text): flexGrow keeps the spacers working on a screen that does fit, and the
    // bottom room keeps the button clear of the floating tab bar.
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        paddingHorizontal: 40,
        // Room for the tab bar below, and the matching share above, so that on a screen
        // where everything fits the art sits exactly where it did before the clearance.
        paddingTop: (tabBarClearance(insets.bottom) * EMPTY_SPACE_ABOVE) / EMPTY_SPACE_BELOW,
        paddingBottom: tabBarClearance(insets.bottom),
      }}
      alwaysBounceVertical={false}
      overScrollMode="never"
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flex: EMPTY_SPACE_ABOVE }} />
      <View style={{ alignItems: "center", gap: 10 }}>
        <View style={{ width: EMPTY_ART_WIDTH, height: EMPTY_ART_HEIGHT }}>
          {EMPTY_TABS.map((t) => (
            <Animated.View
              key={t}
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", opacity: artOpacity[t] }]}
            >
              {/* Aspect ratio is the source art's own (cropped to content), so
                  `contain` does not letterbox it. */}
              <Image
                source={EMPTY_ART[t].source}
                style={{ width: EMPTY_ART_WIDTH, aspectRatio: EMPTY_ART[t].aspect }}
                contentFit="contain"
                accessibilityLabel=""
              />
            </Animated.View>
          ))}
        </View>
        <View style={{ alignItems: "center", gap: 10 }}>
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 20, color: INK }}>{title}</Text>
          {/* minHeight reserves room for the longest body (History's wraps to 3
              lines at this width, the others to 2) — without it, a shorter body
              made this whole block a few px shorter, and centering a shorter
              block shifted the art above it a few px lower. Same reserved height
              on every tab means the art lands at the exact same position. */}
          <View style={{ minHeight: 57, justifyContent: "flex-start" }}>
            <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>{body}</Text>
          </View>
          {/* The one-tap way back to the scanner — without this, an empty
              Saved/History tab (the near-certain first visit to either) was a
              dead end you had to know to escape yourself, via the tab bar. */}
          <PrimaryButton
            size={50}
            label={actionLabel}
            onPress={() =>
              actionHref === "/scanner" ? openScanner() : router.push(actionHref)
            }
            style={{ marginTop: 8 }}
          />
        </View>
      </View>
      <View style={{ flex: EMPTY_SPACE_BELOW }} />
    </ScrollView>
  );
}

/**
 * The destination `savedIngredients` never had. The star on
 * `app/ingredient/[inci].tsx` has toggled this list since it shipped, but
 * nothing anywhere rendered it — a real, persisted list with no reader at
 * all, the exact dead end flagged in review.
 *
 * Resolved through `resolveIngredientNames`, the same dictionary lookup
 * `app/ingredient/[inci].tsx` already uses for its own no-product-context
 * path — there is no product here either, just a starred name.
 */
function IngredientsTab({
  names,
  footer,
  scrollRef,
}: {
  names: string[];
  footer: ReactNode;
  scrollRef: RefObject<ScrollView | null>;
}) {
  const insets = useSafeAreaInsets();
  const toggleSavedIngredient = useAppStore((s) => s.toggleSavedIngredient);
  const [byName, setByName] = useState<Record<string, Ingredient> | null>(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const byNameRef = useRef(byName);
  useEffect(() => {
    byNameRef.current = byName;
  });

  useEffect(() => {
    let cancelled = false;
    setError(false);

    if (names.length === 0) {
      setByName({});
      return;
    }

    // Same shrink-only reasoning as the Saved/History fetch above: unstarring
    // never introduces a name this tab hasn't already resolved.
    const current = byNameRef.current;
    const missing = current ? names.filter((n) => !(n in current)) : names;
    if (current && missing.length === 0) return;

    resolveIngredientNames(current ? missing : names, { strict: true })
      .then((resolved) => {
        if (cancelled) return;
        setByName((prev) => ({
          ...(prev ?? {}),
          ...Object.fromEntries(resolved.map((i) => [i.name, i])),
        }));
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("resolveIngredientNames failed:", err);
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [names, retryKey]);

  if (error) {
    return (
      <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 40, paddingTop: 96 }}>
        <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>
          Couldn&apos;t load your starred ingredients. Check your connection and try again.
        </Text>
        <Pressable onPress={() => setRetryKey((k) => k + 1)} accessibilityRole="button" style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }} className="active:opacity-70">
          <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }

  if (byName === null) {
    return (
      <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 96 }}>
        <ActivityIndicator color={INK} />
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: tabBarClearance(insets.bottom) }}>
      {names.map((name) => {
        const ingredient: Ingredient = byName[name] ?? unknownIngredient(name);
        const verdict = isVerified(ingredient)
          ? ingredient.safety === "avoid"
            ? VERDICT.low
            : ingredient.safety === "caution"
              ? VERDICT.medium
              : VERDICT.high
          : VERDICT_NEUTRAL;
        return (
          <IngredientRow key={name} name={name} bar={verdict.solid} onRemove={() => toggleSavedIngredient(name)} />
        );
      })}
      {footer}
    </ScrollView>
  );
}

/** One starred-ingredient row. Same shape as `Row` above it: the card is a
 *  `Link`, the unstar control is a sibling `Pressable` rather than nested
 *  inside it — see `Row`'s own comment for why nesting breaks the link on
 *  web. */
function IngredientRow({ name, bar, onRemove }: { name: string; bar: string; onRemove: () => void }) {
  const [scale, press] = usePressScale();
  return (
    <LiftedCard scale={scale} backgroundColor={SURFACE}>
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: BORDER_INACTIVE, overflow: "hidden" }}>
      <Link href={{ pathname: "/ingredient/[inci]", params: { inci: name } }} asChild>
        <Pressable style={{ flexDirection: "row" }} {...press}>
          <View style={{ width: 4, alignSelf: "stretch", backgroundColor: bar }} />
          <View style={{ flex: 1, justifyContent: "center", padding: 16, paddingRight: 40 }}>
            <Text style={{ fontSize: 14, color: INK }} numberOfLines={2}>
              {displayIngredientName(name)}
            </Text>
          </View>
        </Pressable>
      </Link>

      <RemoveButton onPress={onRemove} />
    </View>
    </LiftedCard>
  );
}

/**
 * The shelf's filter pills (#227): All, then each group that has something
 * in it, in the fixed order of `STEP_ORDER`. Hidden until there are two
 * groups to choose between.
 */
function StepFilter({
  groups,
  selected,
  onSelect,
}: {
  groups: StepGroup[];
  selected: StepGroup | "all";
  onSelect: (group: StepGroup | "all") => void;
}) {
  if (groups.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      <TypeChip label="All" selected={selected === "all"} onPress={() => onSelect("all")} />
      {groups.map((group) => (
        <TypeChip key={String(group)} label={STEP_LABEL[group]} selected={selected === group} onPress={() => onSelect(group)} />
      ))}
    </ScrollView>
  );
}

/**
 * One line under a saved card: which step it is in, and a way to change it.
 * "Not sorted" asks to be sorted; "Body & hair" is simply where it belongs.
 */
/** What the guest line says (#300). Exported for the tests. */
export const GUEST_SHELF_LINE = "Saves stay on this phone.";

/**
 * Signed out, under the Saved and Ingredients tabs: saving works, and this
 * says where it goes and offers the account that keeps it on every phone.
 * Quiet, one line, never in the way of the shelf itself.
 */
function GuestShelfLine() {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, paddingHorizontal: 20, marginTop: -6 }}>
      <Text style={{ fontSize: TYPE.caption, color: MUTED }}>{GUEST_SHELF_LINE}</Text>
      <Pressable
        onPress={() => router.push({ pathname: "/sign-in", params: { from: "shelf" } })}
        accessibilityRole="link"
        style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }}
        className="active:opacity-70"
      >
        <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
          Sign in to keep them on every phone
        </Text>
      </Pressable>
    </View>
  );
}

function StepLine({ group, chosen, onChange }: { group: StepGroup | null; chosen: boolean; onChange?: () => void }) {
  if (group === null) return null;
  const label = (
    <Text style={{ flex: 1, fontSize: TYPE.caption, color: MUTED }}>
      {group === "unsorted" ? "Not sorted yet" : STEP_LABEL[group]}
      {chosen ? "" : group === "unsorted" ? "" : " · our guess"}
    </Text>
  );
  const lineStyle = { minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 17, borderTopWidth: 1, borderTopColor: BORDER_INACTIVE } as const;
  // A guest sees the step but can't choose one.
  if (!onChange) return <View style={lineStyle}>{label}</View>;
  return (
    <Pressable
      onPress={onChange}
      accessibilityRole="button"
      accessibilityLabel={`Routine step: ${STEP_LABEL[group]}. Change`}
      style={lineStyle}
      className="active:opacity-70"
    >
      {label}
      <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: INK }}>{group === "unsorted" ? "Pick a step" : "Change"}</Text>
    </Pressable>
  );
}

/**
 * Choosing a step (#227). The three steps a product can be put in, and — once
 * the person has chosen — a way back to the guess from the product's type.
 * Where a product belongs, never when to use it: no morning or evening, no
 * order.
 */
function StepPicker({
  productId,
  guess,
  chosen,
  onPick,
  onClose,
}: {
  productId: string | null;
  guess: StepGroup | null;
  chosen: RoutineStep | null;
  onPick: (step: RoutineStep | null) => void;
  onClose: () => void;
}) {
  const current = chosen ?? guess;
  return (
    <BottomSheet visible={productId !== null} onClose={onClose}>
      <Text style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 19, color: INK }}>Which step is it?</Text>
      <View style={{ gap: 10 }}>
        {([1, 2, 3] as const).map((step) => (
          <TypeChip key={step} label={STEP_LABEL[step]} selected={current === step} onPress={() => onPick(step)} />
        ))}
      </View>
      {chosen !== null && guess !== null ? (
        <Pressable onPress={() => onPick(null)} accessibilityRole="button" style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }} className="active:opacity-70">
          <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK }}>
            {guess === "unsorted" ? "Clear my choice" : `Use our guess: ${STEP_LABEL[guess]}`}
          </Text>
        </Pressable>
      ) : null}
    </BottomSheet>
  );
}
