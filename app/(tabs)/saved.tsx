import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Link, router, useFocusEffect, useScrollToTop } from "expo-router";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmSheet } from "@/components/ConfirmSheet";
import { RowChevron } from "@/components/MenuRows";
import { BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { FilterDropdown } from "@/components/FilterDropdown";
import { StarIcon } from "@/components/icons/StarIcon";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { NotePreview } from "@/components/ProductNote";
import { ProductListRow } from "@/components/ProductListRow";
import { ScorePill } from "@/components/ScorePill";
import { SwipeListScope, SwipeToDelete, useSwipeList } from "@/components/SwipeToDelete";
import { TabTitle } from "@/components/TabTitle";
import { Text } from "@/components/Text";
import { VerdictMarker } from "@/components/VerdictMarker";
import { fetchProductsByIds, resolveIngredientNames } from "@/data/api";
import { PRODUCT_TYPE_LABEL, unknownIngredient, type Ingredient, type ProductWithIngredients } from "@/data/types";
import { displayIngredientName } from "@/lib/ingredient-name";
import { shelfPairingNotes, type PairingNote } from "@/lib/active-pairings";
import { relativeTime } from "@/lib/format";
import { LABEL_META, labelWithoutProduct, type IngredientLabel } from "@/lib/ingredient-labels";
import { openScanner } from "@/lib/open-scanner";
import { matchProduct } from "@/lib/matching";
import { STEP_LABEL, STEP_ORDER, stepOf, type StepGroup } from "@/lib/routine-step";
import { tabBarClearance, tabRootTop } from "@/lib/tab-bar";
import { CANVAS, CARD_RADIUS, DISPLAY_FONT, INK, LINK, MUTED, SPACE, SURFACE, TOUCH_TARGET, TYPE, VERDICT_NEUTRAL, WARN } from "@/lib/tokens";
import { useAppStore, type HistoryEntry } from "@/store/useAppStore";
import { haptic } from "@/lib/haptics";
import { reduceMotionNow } from "@/lib/reduce-motion";

type Tab = "saved" | "history" | "ingredients";

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
 * or unsaves it, and a swipe left shows a bin that asks before deleting. A
 * starred ingredient swipes to the same bin and question.
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
  const clearHistory = useAppStore((s) => s.clearHistory);
  const clearSavedProducts = useAppStore((s) => s.clearSavedProducts);
  const clearSavedIngredients = useAppStore((s) => s.clearSavedIngredients);
  const removeHistoryEntry = useAppStore((s) => s.removeHistoryEntry);
  const toggleSaved = useAppStore((s) => s.toggleSaved);

  // The history entry whose bin was tapped, waiting on the confirmation sheet.
  const [deleting, setDeleting] = useState<HistoryEntry | null>(null);
  // Saved's and History's rows swipe to a bin; the list holds still while one does.
  const savedSwipe = useSwipeList();
  const historySwipe = useSwipeList();
  // A saved product with a note, whose heart was untapped: unsaving deletes
  // the note too, so it asks first. One without a note goes at once (owner).
  const [unsaving, setUnsaving] = useState<string | null>(null);

  // The one irreversible action on this screen (see `clearHistory` below) —
  // gated behind a second tap the same way `profile.tsx`'s erase/discard
  // confirms are, rather than firing on a single tap the way this used to.
  // Reset whenever a segment tap leaves History, so switching tabs and back
  // doesn't strand the confirm mid-air with no reminder of what it was
  // confirming — same reasoning as profile.tsx's own reset, done at the tap
  // that causes it rather than in an effect reacting to it after the fact.
  // Which tab's "Clear" is asking, since all three tabs stay mounted.
  const [confirmingClear, setConfirmingClear] = useState<Tab | null>(null);

  // Routine steps (#227): which group the shelf is narrowed to.
  const [stepFilter, setStepFilter] = useState<StepGroup | "all">("all");
  // The tab stays mounted while another one is showing, so an armed "Clear it" would
  // still be waiting when the person came back. Leaving the screen disarms all three.
  useFocusEffect(
    useCallback(() => () => setConfirmingClear(null), [])
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

  // How many rows each tab has: none shows its empty state.
  const counts = { saved: savedIds.length, history: history.length, ingredients: savedIngredients.length };

  // Every tab stays mounted, each with its own opacity: a change fades the
  // tab being left out while the one arriving fades in (owner: no cut between
  // them). Nothing is rebuilt mid-fade, so no picture reloads and no list
  // flashes a spinner, which is what made the old cross-fade look like a cut.
  const [opacity] = useState(
    () => Object.fromEntries(TABS.map((t) => [t, new Animated.Value(t === tab ? 1 : 0)])) as Record<Tab, Animated.Value>
  );
  const selectTab = (next: Tab) => {
    setConfirmingClear(null);
    if (next === tab) return;
    setTab(next);
    const duration = reduceMotionNow() ? 0 : TAB_FADE_MS;
    Animated.parallel(
      TABS.map((t) =>
        Animated.timing(opacity[t], {
          toValue: t === next ? 1 : 0,
          duration,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        })
      )
    ).start();
  };

  const listStyle = { paddingHorizontal: SPACE.gutter, paddingBottom: tabBarClearance(insets.bottom) };
  const loadFailed = (what: string) => (
    <View style={{ alignItems: "center", gap: SPACE.block, paddingHorizontal: 40, paddingTop: 96 }}>
      <Text style={{ textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>
        Couldn&apos;t load your {what}. Check your connection and try again.
      </Text>
      <TextLink label="Try again" onPress={() => setRetryKey((k) => k + 1)} />
    </View>
  );

  /** What one tab shows: its list, or its empty state. `live` is the tab being
   *  shown, and only it takes the scroll ref. */
  const content = (t: Tab, live: boolean) => {
    if (counts[t] === 0) return <EmptyState tab={t} />;
    if (t === "ingredients") {
      return (
        <IngredientsTab
          scrollRef={live ? listRef : undefined}
          names={savedIngredients}
          onClearAll={() => setConfirmingClear(t)}
          clearSheet={
            <ClearSheet
              title="Clear all ingredients?"
              line="Every starred ingredient will be removed."
              visible={confirmingClear === t}
              onCancel={() => setConfirmingClear(null)}
              onConfirm={() => {
                setConfirmingClear(null);
                clearSavedIngredients();
              }}
            />
          }
        />
      );
    }
    if (error) return loadFailed("saved products");
    if (byId === null) {
      return (
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 96 }}>
          <ActivityIndicator color={INK} />
        </View>
      );
    }
    if (t === "saved") {
      const shown = savedIds.filter((id) => byId[id] && (activeFilter === "all" || groupOf(id) === activeFilter));
      return (
        <ScrollView
          ref={live ? listRef : undefined}
          scrollEnabled={savedSwipe.scrollEnabled}
          onScrollBeginDrag={savedSwipe.onScrollBeginDrag}
          contentContainerStyle={listStyle}
        >
          <StepFilter groups={presentGroups} selected={activeFilter} onSelect={setStepFilter} />
          <GroupLabel title={`${shown.length} ${shown.length === 1 ? "product" : "products"}`} onClearAll={() => setConfirmingClear(t)} />
          <View style={{ gap: ROW_GAP }}>
            <SwipeListScope list={savedSwipe.list}>
              {shown.map((id) => {
                const product = byId[id];
                const match = matchProduct(product, profile);
                const note = savedProducts.find((p) => p.id === id)?.note;
                return (
                  <SwipeToDelete key={id} label={product.name} action="Remove" onDelete={() => setUnsaving(id)}>
                    <ProductListRow
                      product={product}
                      score={match.score}
                      detail={productDetail(product)}
                      // Untapping the heart takes it off the shelf at once
                      // (owner), unless that would delete the person's note.
                      onUnsave={note ? () => setUnsaving(id) : undefined}
                    >
                      {/* The person's own words, exactly as written (#228). */}
                      {note ? <NotePreview note={note} /> : null}
                    </ProductListRow>
                  </SwipeToDelete>
                );
              })}
            </SwipeListScope>
          </View>
          <SwipeHint line="Swipe left on a product to remove it" />

          <ShelfPairings notes={shelfNotes} />

          <ConfirmSheet
            visible={unsaving !== null}
            title="Remove from saved?"
            line={unsaving && savedProducts.find((p) => p.id === unsaving)?.note ? "Your note on it will be deleted too." : "It stays in your history."}
            keepLabel="Keep it"
            confirmLabel="Remove"
            onClose={() => setUnsaving(null)}
            onConfirm={() => {
              if (unsaving && savedProducts.some((p) => p.id === unsaving)) toggleSaved(unsaving);
              setUnsaving(null);
            }}
          />
          <ClearSheet
            title="Clear all saved?"
            line="Your products stay in your history."
            visible={confirmingClear === t}
            onCancel={() => setConfirmingClear(null)}
            onConfirm={() => {
              setConfirmingClear(null);
              clearSavedProducts();
            }}
          />
        </ScrollView>
      );
    }
    return (
      <ScrollView
        ref={live ? listRef : undefined}
        scrollEnabled={historySwipe.scrollEnabled}
        onScrollBeginDrag={historySwipe.onScrollBeginDrag}
        contentContainerStyle={listStyle}
      >
        <SwipeListScope list={historySwipe.list}>
          {historyGroups(history).map((group, index) => (
            <View key={group.title}>
              <GroupLabel title={group.title} onClearAll={index === 0 ? () => setConfirmingClear(t) : undefined} />
              <View style={{ gap: ROW_GAP }}>
                {group.entries.map((entry) => {
                  const product = entry.known ? byId[entry.id] : undefined;
                  return (
                    <SwipeToDelete key={entry.id} label={product?.name ?? (entry.label ? "Label photo" : entry.id)} onDelete={() => setDeleting(entry)}>
                      {entry.label ? (
                        <LabelRow entry={entry} ingredients={entry.label} />
                      ) : product ? (
                        // The score it had when it was looked at, not a fresh one:
                        // re-scoring the log is exactly what this screen refuses to do.
                        <ProductListRow product={product} score={entry.scoreAtView} detail={`${product.brand} · ${relativeTime(entry.lastSeenAt)}`}>
                          <HistoryMeta entry={entry} />
                        </ProductListRow>
                      ) : (
                        <UnknownRow entry={entry} />
                      )}
                    </SwipeToDelete>
                  );
                })}
              </View>
            </View>
          ))}
        </SwipeListScope>
        <SwipeHint line="Swipe left on a product to delete it" />

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
        <ClearSheet
          title="Clear your history?"
          line="Every product you've checked will be removed."
          visible={confirmingClear === t}
          onCancel={() => setConfirmingClear(null)}
          onConfirm={() => {
            setConfirmingClear(null);
            clearHistory();
          }}
        />
      </ScrollView>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <View style={{ paddingHorizontal: SPACE.gutter, paddingTop: tabRootTop(insets.top) }}>
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
        style={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.gutter, paddingBottom: SPACE.block }}
      />

      <View style={{ flex: 1 }}>
        {/* All three tabs, one over the other; only the one showing takes
            touches or is heard by a screen reader. */}
        {TABS.map((t) => (
          <Animated.View
            key={t}
            pointerEvents={t === tab ? "auto" : "none"}
            accessibilityElementsHidden={t !== tab}
            importantForAccessibility={t === tab ? "auto" : "no-hide-descendants"}
            style={[StyleSheet.absoluteFill, { opacity: opacity[t] }]}
          >
            {content(t, t === tab)}
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

// v7: the gap between cards in a list.
const ROW_GAP = SPACE.block;

/** "Softwell · Cleanser": the brand, and the product's type when it has one. */
function productDetail(product: ProductWithIngredients): string {
  return product.type === "unknown" ? product.brand : `${product.brand} · ${PRODUCT_TYPE_LABEL[product.type]}`;
}

/** A quiet text action (v7: the link colour, no underline). */
function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ minHeight: TOUCH_TARGET, paddingHorizontal: 4, justifyContent: "center" }}
      className="active:opacity-70"
    >
      <Text style={{ fontSize: TYPE.label, color: LINK }}>{label}</Text>
    </Pressable>
  );
}

/** A group's caps label ("3 PRODUCTS", "TODAY"), and "Clear all" beside the first one. */
function GroupLabel({ title, onClearAll }: { title: string; onClearAll?: () => void }) {
  return (
    <View style={{ minHeight: TOUCH_TARGET, paddingTop: SPACE.text, paddingBottom: 4, paddingLeft: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACE.block }}>
      <Text accessibilityRole="header" style={{ fontSize: TYPE.caption, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: MUTED }}>
        {title}
      </Text>
      {onClearAll ? <TextLink label="Clear all" onPress={onClearAll} /> : null}
    </View>
  );
}

/** The sheet "Clear all" opens; one component so the three tabs wipe the same way. */
function ClearSheet({ title, line, visible, onCancel, onConfirm }: { title: string; line: string; visible: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <ConfirmSheet visible={visible} title={title} line={line} keepLabel="Keep them" confirmLabel="Clear all" onClose={onCancel} onConfirm={onConfirm} />;
}

/** Under a list: how to take something off it, since a swipe can't be seen. */
function SwipeHint({ line }: { line: string }) {
  return <Text style={{ paddingTop: SPACE.block, paddingHorizontal: 4, textAlign: "center", fontSize: TYPE.caption, color: MUTED }}>{line}</Text>;
}

/**
 * History in the design's groups: today, earlier this week, and before that.
 * The store keeps it newest first, so each group is too.
 */
export function historyGroups(history: HistoryEntry[], now = Date.now()): { title: string; entries: HistoryEntry[] }[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const weekAgo = today - 6 * DAY_MS;
  const groups = [
    { title: "Today", entries: history.filter((e) => e.lastSeenAt >= today) },
    { title: "Earlier this week", entries: history.filter((e) => e.lastSeenAt < today && e.lastSeenAt >= weekAgo) },
    { title: "Earlier", entries: history.filter((e) => e.lastSeenAt < weekAgo) },
  ];
  return groups.filter((g) => g.entries.length > 0);
}
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Worth knowing about your shelf" — saved products whose actives tend to add
 * up to more irritation used together (#233), on a white card under the list.
 * Its own line rather than `ExplanationLine`, which capitalises every word of
 * its label — wrong for a product's own name.
 */
function ShelfPairings({ notes }: { notes: PairingNote[] }) {
  if (notes.length === 0) return null;
  return (
    <View style={{ gap: SPACE.block, marginTop: SPACE.section, borderRadius: CARD_RADIUS, backgroundColor: SURFACE, padding: SPACE.gutter }}>
      <Text accessibilityRole="header" style={{ fontSize: TYPE.card, fontWeight: "600", color: INK }}>
        Worth knowing about your shelf
      </Text>
      {notes.map((note) => (
        <View key={note.id} style={{ gap: 2 }}>
          <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>{note.label}</Text>
          <Text style={{ fontSize: TYPE.label, lineHeight: 21, color: MUTED }}>{note.text}</Text>
        </View>
      ))}
    </View>
  );
}

/** How often it was looked at, and what was flagged then, when either is worth saying. */
function HistoryMeta({ entry }: { entry: HistoryEntry }) {
  const parts = [
    entry.seenCount > 1 ? `Checked ${entry.seenCount} times` : null,
    entry.warningsAtView > 0 ? `${entry.warningsAtView} flagged` : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <Text style={{ fontSize: TYPE.caption, color: entry.warningsAtView > 0 ? WARN : MUTED }}>{parts.join(" · ")}</Text>;
}

/**
 * A row with no product picture (v7): a grey tile with a page on it where the
 * bottle would be, a name, a line under it, and whatever sits at the end.
 */
function PlainRow({
  title,
  detail,
  onPress,
  accessibilityLabel,
  end,
  children,
}: {
  title: string;
  detail: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  end?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      style={{ minHeight: ROW_MIN_HEIGHT, flexDirection: "row", alignItems: "center", gap: SPACE.block, paddingVertical: SPACE.block, paddingHorizontal: SPACE.gutter, borderRadius: CARD_RADIUS, backgroundColor: SURFACE }}
      className="active:opacity-70"
    >
      <View style={{ width: TILE, height: TILE, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: VERDICT_NEUTRAL.wash }}>
        <Ionicons name="document-text-outline" size={22} color={MUTED} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2} style={{ fontSize: TYPE.label, fontWeight: "600", lineHeight: 19, color: INK }}>
          {title}
        </Text>
        <Text numberOfLines={2} style={{ fontSize: TYPE.caption, color: MUTED }}>
          {detail}
        </Text>
        {children}
      </View>
      {end}
    </Pressable>
  );
}

// A row's least height, and the tile where a product's bottle would be (v7).
const ROW_MIN_HEIGHT = 76;
const TILE = 52;

/**
 * A label photo in History: what was read off the pack, its score then, and a
 * tap that opens the same result again (owner). The list is kept on the entry.
 */
function LabelRow({ entry, ingredients }: { entry: HistoryEntry; ingredients: string[] }) {
  return (
    <PlainRow
      title="Label photo"
      detail={`${ingredients.length} ingredients · ${relativeTime(entry.lastSeenAt)}`}
      onPress={() => router.push({ pathname: "/label-result", params: { entry: entry.id } })}
      accessibilityLabel={`Label photo, ${ingredients.length} ingredients, ${relativeTime(entry.lastSeenAt)}`}
      end={
        <>
          <ScorePill score={entry.scoreAtView} />
          <RowChevron />
        </>
      }
    >
      <HistoryMeta entry={entry} />
    </PlainRow>
  );
}

/**
 * A history entry with no product to show. Two different situations, and this
 * row used to state the first one for both.
 *
 * `known: false` — a scanned barcode the cascade found nothing for. "We don't
 * have this product" is exactly right, and the barcode shown is a real one the
 * user can compare against the bottle.
 *
 * `known: true` — a catalogue product that did not come back. Its id is an
 * internal one (`obf-8801234567890`), ours not theirs, so it isn't shown; and
 * the row says it is no longer in the catalogue, not that it never was — they
 * opened it, which is why it is in their history. This branch is only reached
 * after a *successful* read (a failed one puts the whole tab into its error
 * state), so "no longer" is established rather than guessed.
 */
function UnknownRow({ entry }: { entry: HistoryEntry }) {
  return entry.known ? (
    <PlainRow title="No longer in our catalogue" detail={`Opened · ${relativeTime(entry.lastSeenAt)}`}>
      <HistoryMeta entry={entry} />
    </PlainRow>
  ) : (
    <PlainRow title={entry.id} detail={`Scanned · we don't have this product · ${relativeTime(entry.lastSeenAt)}`}>
      <HistoryMeta entry={entry} />
    </PlainRow>
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
    body: "Tap Save on any product and it will wait for you here, including next time you open the app.",
  },
  history: {
    title: "Nothing checked yet",
    body: "Every product you open or scan is logged here automatically, so you can tell at a glance whether you have already checked something.",
  },
  ingredients: {
    title: "No starred ingredients yet",
    body: "Open a product, tap an ingredient, then tap its star to keep it here.",
  },
};

// The pictures' width (v7: at most 280).
const EMPTY_ART_WIDTH = 280;
// The picture's box is as tall as the tallest of them, and each starts at its top,
// so the text under the picture starts at the same place on every tab.
const EMPTY_ART_HEIGHT = EMPTY_ART_WIDTH / Math.min(...Object.values(EMPTY_ART).map((art) => art.aspect));

// The empty state's scan button, and the room it keeps on Ingredients; and the
// room kept for the longest body (four 21pt lines).
const EMPTY_BUTTON_HEIGHT = 48;
const EMPTY_BODY_HEIGHT = 84;

// How long a tab change cross-fades, one whole tab into the next.
const TAB_FADE_MS = 300;
const TABS: Tab[] = ["saved", "history", "ingredients"];

/**
 * What an empty tab shows: its picture and words, and on Saved the first scan.
 * Each tab has its own; the tab change fades one into the next.
 */
function EmptyState({ tab }: { tab: Tab }) {
  const insets = useSafeAreaInsets();
  const { title, body } = EMPTY_COPY[tab];

  return (
    // Just the picture and its words, centred in the room between the tab
    // switch and the tab bar (owner): no button. Every tab's block is the same
    // height (the picture box and the reserved body height below), so the
    // picture doesn't move when the tab changes. Scrolls only when it doesn't
    // fit (a short phone, large text).
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 32, paddingBottom: tabBarClearance(insets.bottom) }}
      alwaysBounceVertical={false}
      overScrollMode="never"
      showsVerticalScrollIndicator={false}
    >
      <View style={{ alignItems: "center", gap: SPACE.text }}>
        <View style={{ width: EMPTY_ART_WIDTH, height: EMPTY_ART_HEIGHT }}>
          {/* Aspect ratio is the source art's own (cropped to content), so
              `contain` does not letterbox it. */}
          <Image
            source={EMPTY_ART[tab].source}
            style={{ width: EMPTY_ART_WIDTH, aspectRatio: EMPTY_ART[tab].aspect }}
            contentFit="contain"
            accessibilityLabel=""
          />
        </View>
        <View style={{ alignItems: "center", gap: SPACE.text }}>
          <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
            {title}
          </Text>
          {/* minHeight reserves room for the longest body (History's wraps to 4
              lines at this width, the others to 2 or 3) — without it, a shorter
              body made this whole block shorter, and centering a shorter block
              shifted the art above it. Same reserved height on every tab means
              the art lands at the exact same position. */}
          <View style={{ minHeight: EMPTY_BODY_HEIGHT, maxWidth: 300, justifyContent: "flex-start" }}>
            <Text style={{ textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>{body}</Text>
          </View>
          {/* Only Saved offers the first scan (owner); History and
              Ingredients keep the room the button takes, so the picture above
              stays put when the tab changes. */}
          {tab !== "saved" ? (
            <View style={{ height: EMPTY_BUTTON_HEIGHT, marginTop: SPACE.gutter }} />
          ) : (
            <PrimaryButton label="Scan your first product" onPress={openScanner} style={{ width: BUTTON_WIDTH.secondary, marginTop: SPACE.gutter }} />
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
  onClearAll,
  clearSheet,
  scrollRef,
}: {
  names: string[];
  onClearAll: () => void;
  /** The "Clear all" question, which the screen owns. */
  clearSheet: ReactNode;
  /** Only on the tab being shown, not the one fading out. */
  scrollRef?: RefObject<ScrollView | null>;
}) {
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const toggleSavedIngredient = useAppStore((s) => s.toggleSavedIngredient);
  // The ingredient a swipe asked to delete, until the question is answered.
  const [deleting, setDeleting] = useState<string | null>(null);
  const swipe = useSwipeList();
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
      <View style={{ alignItems: "center", gap: SPACE.block, paddingHorizontal: 40, paddingTop: 96 }}>
        <Text style={{ textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>
          Couldn&apos;t load your starred ingredients. Check your connection and try again.
        </Text>
        <TextLink label="Try again" onPress={() => setRetryKey((k) => k + 1)} />
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
    <ScrollView
      ref={scrollRef}
      scrollEnabled={swipe.scrollEnabled}
      onScrollBeginDrag={swipe.onScrollBeginDrag}
      contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingBottom: tabBarClearance(insets.bottom) }}
    >
      <GroupLabel title={`${names.length} starred`} onClearAll={onClearAll} />
      <View style={{ gap: ROW_GAP }}>
        <SwipeListScope list={swipe.list}>
          {names.map((name) => {
            const ingredient: Ingredient = byName[name] ?? unknownIngredient(name);
            return (
              <SwipeToDelete key={name} label={displayIngredientName(ingredient.name)} onDelete={() => setDeleting(name)}>
                <IngredientRow ingredient={ingredient} label={labelWithoutProduct(ingredient, profile)} onUnstar={() => toggleSavedIngredient(name)} />
              </SwipeToDelete>
            );
          })}
        </SwipeListScope>
      </View>
      <SwipeHint line="Swipe left on an ingredient to remove it" />

      {/* The same swipe, bin and question as a History row (owner). */}
      <ConfirmSheet
        visible={deleting !== null}
        title="Delete ingredient?"
        line="It will disappear from your starred ingredients."
        keepLabel="Keep it"
        confirmLabel="Delete"
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting && names.includes(deleting)) toggleSavedIngredient(deleting);
          setDeleting(null);
        }}
      />

      {clearSheet}
    </ScrollView>
  );
}

/**
 * One starred ingredient (v7): its name, the verdict marker under it (or "No
 * known concerns"), the filled star — untap it to unstar — and a chevron. The
 * card is a `Link`; the star is its sibling, not inside it, so a tap on it
 * never opens the ingredient.
 */
function IngredientRow({ ingredient, label, onUnstar }: { ingredient: Ingredient; label: IngredientLabel | null; onUnstar: () => void }) {
  const name = displayIngredientName(ingredient.name);
  return (
    <View style={{ minHeight: ROW_MIN_HEIGHT, flexDirection: "row", alignItems: "center", borderRadius: CARD_RADIUS, backgroundColor: SURFACE }}>
      <Link href={{ pathname: "/ingredient/[inci]", params: { inci: ingredient.name } }} asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name}, ${label ? LABEL_META[label].label : "No known concerns"}`}
          style={{ flex: 1, gap: 3, paddingVertical: SPACE.block, paddingLeft: SPACE.gutter, paddingRight: 4 }}
          className="active:opacity-70"
        >
          <Text numberOfLines={2} style={{ fontSize: TYPE.label, fontWeight: "600", lineHeight: 19, color: INK }}>
            {name}
          </Text>
          {label ? <VerdictMarker label={label} /> : <Text style={{ fontSize: TYPE.caption, color: MUTED }}>No known concerns</Text>}
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
        style={{ width: 36, height: TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
        className="active:opacity-70"
      >
        <StarIcon filled size={20} />
      </Pressable>
      <View style={{ paddingRight: SPACE.gutter }}>
        <RowChevron />
      </View>
    </View>
  );
}

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

