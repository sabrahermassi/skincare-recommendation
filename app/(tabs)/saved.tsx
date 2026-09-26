import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Link, router, useFocusEffect, useScrollToTop } from "expo-router";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "@/components/BottomSheet";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { PrimaryButton } from "@/components/PrimaryButton";
import { FilterDropdown } from "@/components/FilterDropdown";
import { StarIcon } from "@/components/icons/StarIcon";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { NotePreview } from "@/components/ProductNote";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { SaveHeart } from "@/components/SaveHeart";
import { ScorePill } from "@/components/ScorePill";
import { SwipeToDelete } from "@/components/SwipeToDelete";
// One selected-outline color app-wide — see profile.tsx's own note on why
// this FOR.ME shell token is reused outside its original scope.
import { TabTitle } from "@/components/TabTitle";
import { Text } from "@/components/Text";
import { TypeChip } from "@/components/TypeChip";
import { fetchProductsByIds, resolveIngredientNames } from "@/data/api";
import { unknownIngredient, type Ingredient, type ProductWithIngredients } from "@/data/types";
import { displayIngredientName } from "@/lib/ingredient-name";
import { shelfPairingNotes, type PairingNote } from "@/lib/active-pairings";
import { relativeTime, SAFETY_LABEL } from "@/lib/format";
import { openScanner } from "@/lib/open-scanner";
import { matchProduct } from "@/lib/matching";
import { STEP_LABEL, STEP_ORDER, TYPE_STEP, stepOf, type RoutineStep, type StepGroup } from "@/lib/routine-step";
import { isTabEmpty, type SavedTab } from "@/lib/saved-tabs";
import { isVerified } from "@/lib/safety";
import { useCanJournal } from "@/lib/saving";
import { LiftedCard, usePressScale } from "@/components/PressableCard";
import { tabBarClearance } from "@/lib/tab-bar";
import { BORDER_INACTIVE, CANVAS, FLOATING_SHADOW, INK, MUTED, MUTED_FAINT, SPACE, SURFACE, TOUCH_TARGET, TYPE, VERDICT, VERDICT_NEUTRAL, WARN } from "@/lib/tokens";
import { useAppStore, type HistoryEntry, type SavedProduct } from "@/store/useAppStore";
import { haptic } from "@/lib/haptics";
import { reduceMotionNow } from "@/lib/reduce-motion";

type Tab = SavedTab;

/**
 * The shelf and the log, on one screen.
 *
 * They look similar but obey different rules, and the difference is the point:
 * saved rows are re-scored live against the current profile, because a shelf
 * should say what you think today. History rows show the score as it stood
 * when you looked - a log that rewrites its own past entries is worse than no
 * log.
 *
 * Both are the same white card (owner's reference): picture, brand, name, the
 * score as a pill and a heart in the corner. On a saved card the pill is
 * today's score and untapping the heart takes the product off the shelf; on a
 * history card the pill is the score it had when you looked, the heart saves
 * or unsaves it, and a swipe left shows a bin that asks before deleting.
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
  const shelfOwner = useAppStore((s) => s.shelfOwner);
  const canJournal = useCanJournal();

  // A removed row's own data, held just long enough to put it back — nothing
  // here is written until a timer or a tab switch clears it, so Undo can
  // always restore exactly what was on screen a moment ago rather than
  // re-deriving it from whatever the list looks like by the time it's
  // tapped.
  const [pendingUndo, setUndo] = useState<
    { kind: "saved"; product: SavedProduct; owner: string | null } | null
  >(null);
  // The history entry whose bin was tapped, waiting on the confirmation sheet.
  const [deleting, setDeleting] = useState<HistoryEntry | null>(null);
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
  const counts = { saved: savedIds.length, history: history.length, ingredients: savedIngredients.length };

  // The tab being left, while it fades out under the one arriving (owner: no
  // cut between them). Two empty tabs share one empty state instead, whose
  // own picture cross-fade covers the change.
  const [leaving, setLeaving] = useState<Tab | null>(null);
  const [crossfade] = useState(() => new Animated.Value(1));
  const fading = leaving !== null && !(isTabEmpty(leaving, counts, undo?.kind) && isTabEmpty(tab, counts, undo?.kind));
  const selectTab = (next: Tab) => {
    setConfirmingClear(false);
    if (next === tab) return;
    setLeaving(tab);
    setTab(next);
    crossfade.setValue(0);
    Animated.timing(crossfade, {
      toValue: 1,
      duration: reduceMotionNow() ? 0 : EMPTY_FADE_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start(({ finished }) => {
      if (finished) setLeaving(null);
    });
  };

  /** What one tab shows: its list, or its empty state. `live` is the tab being
   *  shown, as opposed to the one fading out, and only it takes the scroll ref. */
  const content = (t: Tab, live: boolean) => {
    const empty = isTabEmpty(t, counts, undo?.kind);
    return (
      <>
          {empty ? (
            <EmptyState tab={t} />
          ) : t === "ingredients" ? (
            <IngredientsTab
              key="ingredients"
              scrollRef={live ? listRef : undefined}
              names={savedIngredients}
              footer={
                <ClearAll
                  label="Clear ingredients"
                  question="Clear all your starred ingredients?"
                  line="Every ingredient you starred leaves this list."
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
          ) : t === "saved" ? (
            // `key` on each list: Saved and History are the same kind of element in the
            // same spot, so without it React reuses one scroll view for both and the
            // scroll position carries over when switching tabs.
            <ScrollView key="saved" ref={live ? listRef : undefined} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: tabBarClearance(insets.bottom) }}>
              <StepFilter groups={presentGroups} selected={activeFilter} onSelect={setStepFilter} />
              {savedIds.map((id) => {
                const product = byId[id];
                if (!product) return null;
                if (activeFilter !== "all" && groupOf(id) !== activeFilter) return null;
                const match = matchProduct(product, profile);
                return (
                  <Row
                    key={id}
                    product={product}
                    corner={
                      // Untapping the heart takes it off the shelf, with a moment to undo.
                      <SaveHeart
                        productId={id}
                        onUnsave={() => {
                          const saved = savedProducts.find((p) => p.id === id);
                          toggleSaved(id);
                          if (saved) showUndo({ kind: "saved", product: saved, owner: shelfOwner });
                        }}
                      />
                    }
                    footer={
                      <StepLine
                        group={groupOf(id)}
                        chosen={savedProducts.find((p) => p.id === id)?.routineStep !== undefined}
                        // Steps, like notes, are signed-in only (#300).
                        onChange={canJournal ? () => setPickingStepFor(id) : undefined}
                      />
                    }
                  >
                    {savedProducts.find((p) => p.id === id)?.note ? (
                      // The person's own words, exactly as written (#228).
                      <NotePreview note={savedProducts.find((p) => p.id === id)!.note!} />
                    ) : null}
                    <ScorePill score={match.score} />
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
                line="Every product leaves your shelf. It can't be undone."
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
            <ScrollView key="history" ref={live ? listRef : undefined} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: tabBarClearance(insets.bottom) }}>
              {history.map((entry) => {
                const product = entry.known ? byId[entry.id] : undefined;
                return (
                  <SwipeToDelete key={entry.id} label={product?.name ?? (entry.label ? "Label photo" : entry.id)} onDelete={() => setDeleting(entry)}>
                    {entry.label ? (
                      <LabelRow entry={entry} ingredients={entry.label} />
                    ) : product ? (
                      <Row product={product} corner={<SaveHeart productId={product.id} fetchedAt={product.fetchedAt} />}>
                        {/* The score it had when it was looked at, not a fresh one:
                            re-scoring the log is exactly what this screen refuses to do. */}
                        <ScorePill score={entry.scoreAtView} />
                        <HistoryMeta entry={entry} />
                      </Row>
                    ) : (
                      <UnknownRow entry={entry} />
                    )}
                  </SwipeToDelete>
                );
              })}

              <ConfirmSheet
                visible={deleting !== null}
                title="Delete product?"
                line="It will disappear from your history."
                keepLabel="Keep it"
                confirmLabel="Delete"
                onClose={() => setDeleting(null)}
                onConfirm={() => {
                  if (deleting) removeHistoryEntry(deleting.id);
                  setDeleting(null);
                }}
              />

              <ClearAll
                label="Clear history"
                question="Clear your whole history?"
                line="Every product you opened or scanned leaves your history. It can't be undone."
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
      </>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 14 }}>
        <TabTitle>Saved</TabTitle>
      </View>

      {/* The three lists in one light capsule (owner's reference), words only:
          no counts on a select button, anywhere (owner). */}
      <SegmentedSwitch
        options={[
          { value: "saved", label: "Saved" },
          { value: "history", label: "History" },
          { value: "ingredients", label: "Ingredients" },
        ]}
        selected={tab}
        onSelect={selectTab}
        tone="light"
        style={{ paddingHorizontal: 16, paddingVertical: 14 }}
      />

      <View style={{ flex: 1 }}>
        {/* The tab that was showing fades out over the one arriving, which fades
            in: nothing cuts from one to the other (owner). Hidden from screen
            readers, which only ever hear the arriving tab. */}
        {fading ? (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[StyleSheet.absoluteFill, { opacity: crossfade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
          >
            {content(leaving, false)}
          </Animated.View>
        ) : null}
        <Animated.View style={{ flex: 1, opacity: fading ? crossfade : 1 }}>{content(tab, true)}</Animated.View>
      </View>
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

/** The "Clear …" link at the foot of a list, and the sheet that asks before it
 *  clears (`ConfirmSheet`). One component so Saved, History and Ingredients
 *  wipe the same way. */
function ClearAll({
  label,
  question,
  line,
  confirming,
  onAsk,
  onCancel,
  onConfirm,
}: {
  label: string;
  question: string;
  /** What clearing takes away, under the question. */
  line: string;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <Pressable onPress={onAsk} accessibilityRole="button" style={[CLEAR_TARGET, { alignSelf: "center" }]} className="active:opacity-70">
        <Text style={{ fontSize: 13, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>{label}</Text>
      </Pressable>
      <ConfirmSheet visible={confirming} title={question} line={line} keepLabel="Keep them" confirmLabel={label} onClose={onCancel} onConfirm={onConfirm} />
    </>
  );
}

/** A Saved or History card: white and rounded, the picture, brand and name,
 *  whatever the caller puts under them, and the heart in the corner. The
 *  whole card is a link to the product; the heart is a sibling of the link,
 *  not inside it (see below). */
function Row({
  product,
  corner,
  children,
  footer,
}: {
  product: ProductWithIngredients;
  /** The heart in the top-right corner. */
  corner: ReactNode;
  children: ReactNode;
  /** Controls under the card's link, outside it — see the note below on why. */
  footer?: ReactNode;
}) {
  const [scale, press] = usePressScale();
  return (
    // The card's chrome lives on a plain View, not the Link/Pressable
    // itself — `Link asChild` renders an actual `<a>` on web, and a click
    // anywhere inside an anchor triggers its navigation, `stopPropagation`
    // on a nested Pressable notwithstanding. Keeping the heart a sibling
    // outside the anchor, not a descendant of it, is the only fix that holds.
    <LiftedCard radius={CARD_RADIUS} scale={scale} backgroundColor={SURFACE}>
      <View style={{ borderRadius: CARD_RADIUS, overflow: "hidden" }}>
        <Link href={`/product/${product.id}`} asChild>
          <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 18, paddingRight: CORNER_CLEARANCE }} {...press}>
            <ProductThumbnail product={product} size={CARD_THUMB} radius={16} backgroundColor={SURFACE} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ gap: 2 }}>
                <Text numberOfLines={1} style={{ fontSize: TYPE.label, color: MUTED_FAINT }}>
                  {product.brand}
                </Text>
                <Text numberOfLines={2} style={{ fontSize: 17, fontWeight: "500", lineHeight: 22, color: INK }}>
                  {product.name}
                </Text>
              </View>
              {children}
            </View>
          </Pressable>
        </Link>
        {footer}
        <View style={{ position: "absolute", top: 6, right: 6 }}>{corner}</View>
      </View>
    </LiftedCard>
  );
}

// A Saved or History card: its corners, its picture, and the room its name
// leaves for the heart in the corner.
const CARD_RADIUS = 24;
const CARD_THUMB = 72;
const CORNER_CLEARANCE = 52;

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

/** When it was looked at, how often, and what was flagged then. */
function HistoryMeta({ entry }: { entry: HistoryEntry }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 }}>
      <Text style={{ fontSize: TYPE.caption, color: MUTED }}>{relativeTime(entry.lastSeenAt)}</Text>
      {entry.seenCount > 1 && (
        <Text style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>
          · checked {entry.seenCount} times
        </Text>
      )}
      {entry.warningsAtView > 0 && (
        <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: WARN }}>
          · {entry.warningsAtView} flagged
        </Text>
      )}
    </View>
  );
}

/**
 * A label photo in History: what was read off the pack, its score then, and a
 * tap that opens the same result again (owner). The list is kept on the entry.
 */
function LabelRow({ entry, ingredients }: { entry: HistoryEntry; ingredients: string[] }) {
  const [scale, press] = usePressScale();
  return (
    <LiftedCard radius={CARD_RADIUS} scale={scale} backgroundColor={SURFACE}>
      <Pressable
        onPress={() => router.push({ pathname: "/label-result", params: { entry: entry.id } })}
        accessibilityRole="button"
        accessibilityLabel={`Label photo, ${ingredients.length} ingredients, ${relativeTime(entry.lastSeenAt)}`}
        style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 18, borderRadius: CARD_RADIUS }}
        {...press}
      >
        <View style={{ width: CARD_THUMB, height: CARD_THUMB, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
          <Ionicons name="document-text-outline" size={30} color={MUTED} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: TYPE.label, color: MUTED_FAINT }}>{ingredients.length} ingredients</Text>
            <Text style={{ fontSize: 17, fontWeight: "500", lineHeight: 22, color: INK }}>Label photo</Text>
          </View>
          <ScorePill score={entry.scoreAtView} />
          <HistoryMeta entry={entry} />
        </View>
      </Pressable>
    </LiftedCard>
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
function UnknownRow({ entry }: { entry: HistoryEntry }) {
  return (
    <LiftedCard radius={CARD_RADIUS} backgroundColor={SURFACE}>
      <View style={{ gap: 6, padding: 18 }}>
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
      </View>
    </LiftedCard>
  );
}

// One picture for each tab's empty state, with its own proportions (width / height)
// so `contain` never letterboxes it.
const EMPTY_ART = {
  saved: { source: require("@/assets/illustrations/saved-empty-shelf.webp"), aspect: 1400 / 779 },
  history: { source: require("@/assets/illustrations/history-empty.webp"), aspect: 1400 / 891 },
  ingredients: { source: require("@/assets/illustrations/ingredients-empty.webp"), aspect: 1400 / 884 },
} as const;

type EmptyCopy = { title: string; body: string };

const EMPTY_COPY: Record<Tab, EmptyCopy> = {
  saved: {
    title: "No products saved yet",
    body: "Tap Save on any product and it will wait for you here - including next time you open the app.",
  },
  history: {
    title: "No history yet",
    body: "Every product you open or scan is logged here automatically, so you can tell at a glance whether you have already checked something.",
  },
  ingredients: {
    title: "No starred ingredients yet",
    body: "Open a product, tap an ingredient, then tap its star to keep it here.",
  },
};

// Wider than the text block under it (which has 40 either side): these are wide pictures.
const EMPTY_ART_WIDTH = 340;
// The picture's box is as tall as the tallest of them, and each starts at its top,
// so the text under the picture starts at the same place on every tab.
const EMPTY_ART_HEIGHT = EMPTY_ART_WIDTH / Math.min(...Object.values(EMPTY_ART).map((art) => art.aspect));

// The empty state's scan button, and the room it keeps on Ingredients.
const EMPTY_BUTTON_HEIGHT = 52;

// How long a tab change cross-fades: the pictures between two empty tabs, or
// the whole of one tab into the next.
const EMPTY_FADE_MS = 300;
const EMPTY_TABS = Object.keys(EMPTY_ART) as Tab[];

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

  const { title, body } = EMPTY_COPY[tab];

  return (
    // Just the picture and its words, centred in the room between the tab
    // switch and the tab bar (owner): no button. Every tab's block is the same
    // height (the picture box and the reserved body height below), so the
    // picture doesn't move when the tab changes. Scrolls only when it doesn't
    // fit (a short phone, large text).
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 40, paddingBottom: tabBarClearance(insets.bottom) }}
      alwaysBounceVertical={false}
      overScrollMode="never"
      showsVerticalScrollIndicator={false}
    >
      <View style={{ alignItems: "center", gap: 10 }}>
        <View style={{ width: EMPTY_ART_WIDTH, height: EMPTY_ART_HEIGHT }}>
          {EMPTY_TABS.map((t) => (
            <Animated.View
              key={t}
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "flex-start", opacity: artOpacity[t] }]}
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
          {/* Saved and History start with a scan (owner's reference); a
              starred ingredient comes from a product page, so Ingredients has
              no button — only the room one takes, so the picture above stays
              put when the tab changes. */}
          {tab === "ingredients" ? (
            <View style={{ height: EMPTY_BUTTON_HEIGHT, marginTop: SPACE.text }} />
          ) : (
            <PrimaryButton size={EMPTY_BUTTON_HEIGHT} label="Scan your first product" onPress={openScanner} style={{ marginTop: SPACE.text }} />
          )}
        </View>
      </View>
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
  /** Only on the tab being shown, not the one fading out. */
  scrollRef?: RefObject<ScrollView | null>;
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
        return <IngredientRow key={name} ingredient={ingredient} onUnstar={() => toggleSavedIngredient(name)} />;
      })}
      {footer}
    </ScrollView>
  );
}

/**
 * One starred ingredient, the same white card as a Saved or History product
 * (owner): a tinted disc where the product picture would be, the name, what it
 * does, its safety as a pill, and the filled star in the corner — untap it to
 * unstar. The card is a `Link`; the star is its sibling, not inside it (see
 * `Row`).
 */
function IngredientRow({ ingredient, onUnstar }: { ingredient: Ingredient; onUnstar: () => void }) {
  const [scale, press] = usePressScale();
  const known = isVerified(ingredient);
  const verdict = !known
    ? VERDICT_NEUTRAL
    : ingredient.safety === "avoid"
      ? VERDICT.low
      : ingredient.safety === "caution"
        ? VERDICT.medium
        : VERDICT.high;
  const role = ingredient.functions && ingredient.functions.length > 0 ? ingredient.functions.slice(0, 2).join(" · ") : null;
  return (
    <LiftedCard radius={CARD_RADIUS} scale={scale} backgroundColor={SURFACE}>
      <View style={{ borderRadius: CARD_RADIUS, overflow: "hidden" }}>
        <Link href={{ pathname: "/ingredient/[inci]", params: { inci: ingredient.name } }} asChild>
          <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 18, paddingRight: CORNER_CLEARANCE }} {...press}>
            <View style={{ width: INGREDIENT_DISC, height: INGREDIENT_DISC, borderRadius: INGREDIENT_DISC / 2, alignItems: "center", justifyContent: "center", backgroundColor: verdict.tint }}>
              <Ionicons name="water" size={24} color={verdict.deep} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ gap: 2 }}>
                <Text numberOfLines={2} style={{ fontSize: 17, fontWeight: "500", lineHeight: 22, color: INK }}>
                  {displayIngredientName(ingredient.name)}
                </Text>
                {role ? (
                  <Text numberOfLines={1} style={{ fontSize: TYPE.label, color: MUTED_FAINT }}>
                    {role}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: verdict.tint }}>
                <Text style={{ fontSize: TYPE.label, fontWeight: "700", color: verdict.deep }}>{known ? SAFETY_LABEL[ingredient.safety] : "Not recognised"}</Text>
              </View>
            </View>
          </Pressable>
        </Link>
        <Pressable
          onPress={() => {
            haptic.tap();
            onUnstar();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Remove from starred ingredients"
          accessibilityState={{ selected: true }}
          style={{ position: "absolute", top: 6, right: 6, width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
          className="active:opacity-70"
        >
          <StarIcon filled size={24} />
        </Pressable>
      </View>
    </LiftedCard>
  );
}

// The disc where a starred ingredient's picture would be, as wide as a product's.
const INGREDIENT_DISC = 56;

/**
 * The shelf's filter (#227), as one dropdown: All, then each group that has
 * something in it, in the fixed order of `STEP_ORDER`. Hidden until there
 * are two groups to choose between.
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
    <FilterDropdown
      options={[{ value: "all", label: "All" }, ...groups.map((group) => ({ value: String(group), label: STEP_LABEL[group] }))]}
      selected={String(selected)}
      onSelect={(value) => onSelect(value === "all" ? "all" : (groups.find((g) => String(g) === value) ?? "all"))}
    />
  );
}

/**
 * One line under a saved card: which step it is in, and a way to change it.
 * "Not sorted" asks to be sorted; "Body & hair" is simply where it belongs.
 */
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
