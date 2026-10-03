import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Animated, PanResponder, Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { FitScrollView } from "@/components/FitScrollView";
import { CloseCross } from "@/components/IconCircle";
import { BUTTON_HEIGHT } from "@/components/PrimaryButton";
import { Tick } from "@/components/skin-needs/bits";
import { AlternateSheet, OneAtATimeSheet, StartRoutineSheet, SwapOrAddSheet, yours } from "@/components/skin-needs/RoutineSheets";
import { AvoidCard, inSentence, PairsCard, ShopCard, StartCard, WhenCard, WhyCard } from "@/components/skin-needs/StoryCards";
import { TopToast, type TopNotice } from "@/components/skin-needs/TopToast";
import { Text } from "@/components/Text";
import { encodeNeed, GOALS } from "@/lib/journey";
import { openScanner } from "@/lib/open-scanner";
import { isPersonalized } from "@/lib/profile";
import {
  activeOf,
  daysLabel,
  decodeAnswers,
  entryFor,
  familyOf,
  findActive,
  hasStory,
  holdsActive,
  needFrom,
  placeLine,
  planAdd,
  sensitivityOf,
  storyLength,
  withAdded,
  withAlternated,
  withSwapped,
  type AddPlan,
  type NeedAnswers,
  type RoutineEntry,
  type RoutineState,
  type StepLimit,
  type StoryActive,
} from "@/lib/skin-needs";
import type { ActiveKey } from "@/lib/skin-needs-data";
import { useOwnProducts } from "@/lib/use-own-products";
import { BUTTON, CANVAS, ICON_SHADOW, INK, MUTED, MUTED_FAINT, SKIN_NEEDS, SPACE, SURFACE, WHITE, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

type CardKey = "why" | "start" | "when" | "pairs" | "avoid" | "shop";

// How far down a swipe has to travel to close the story.
const CLOSE_DRAG = 90;

/**
 * An active's story (design_handoff "october 3d", 2–7): six full-screen cards,
 * five when it has nothing to avoid. Tap the right two-thirds for the next,
 * the left third to go back, swipe down to close; nothing moves on its own.
 * The last card adds the active to the routine: for.me picks the routine and
 * the step, and asks only when there is a choice to make.
 */
export default function JourneyStory() {
  const params = useLocalSearchParams<{ active?: string; answers?: string }>();
  const answers = useMemo(() => decodeAnswers(params.answers, GOALS.map((goal) => goal.key)), [params.answers]);
  const record = findActive(params.active);
  if (!answers || !record || !hasStory(record)) return <NothingToShow />;
  return <Story active={record} answers={answers} />;
}

function NothingToShow() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS, paddingTop: insets.top + 12, alignItems: "center", justifyContent: "center", gap: SPACE.block, paddingHorizontal: SPACE.gutter }}>
      <Text style={{ textAlign: "center", fontSize: TYPE.body, color: MUTED }}>This story can&apos;t be shown.</Text>
      <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center" }}>
        <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: BUTTON.primary.fill }}>Close</Text>
      </Pressable>
    </View>
  );
}

type SheetState =
  | { kind: "start" }
  | Extract<AddPlan, { kind: "full" }>
  | (Extract<AddPlan, { kind: "clash" }> & { preview: { otherDays: number[]; newDays: number[] } });

function Story({ active, answers }: { active: StoryActive; answers: NeedAnswers }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cards: CardKey[] = active.story.avoid ? ["why", "start", "when", "pairs", "avoid", "shop"] : ["why", "start", "when", "pairs", "shop"];
  const total = storyLength(active);
  const [index, setIndex] = useState(0);
  const card = cards[index];
  const goal = GOALS.find((g) => g.key === answers.goal)!;

  // ── The routine as it is now ──
  const profile = useAppStore((s) => s.profile);
  const entries = useAppStore((s) => s.routineActives);
  const stepLimit = useAppStore((s) => s.routineStepLimit);
  const started = useAppStore((s) => s.routineStarted);
  const setRoutineActives = useAppStore((s) => s.setRoutineActives);
  const saveIngredient = useAppStore((s) => s.saveIngredient);
  const toggleSavedIngredient = useAppStore((s) => s.toggleSavedIngredient);
  const routinePicks = useAppStore((s) => s.routinePicks);
  const own = useOwnProducts(Object.values(routinePicks));
  // A product of their own in the routine that holds this active counts as having it (hand-off 7f).
  const ownProduct = useMemo(() => [...own.found.values()].find((product) => holdsActive(product.ingredients, active)) ?? null, [own.found, active]);
  const added = entries.some((entry) => entry.active === active.key);
  const inRoutine = added || ownProduct !== null;

  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [notice, setNotice] = useState<TopNotice | null>(null);
  const clearNotice = useCallback(() => setNotice(null), []);
  // Shown after an add made here: "See my routine" in place of Add (7d, 7e).
  const [addedHere, setAddedHere] = useState(false);

  // What Undo goes back to when a routine was started on this Add and a sheet
  // still had a choice to ask: the routine as it was before the start, so
  // Undo takes the new routine away too (hand-off 7c), not just the active.
  const [beforeStart, setBeforeStart] = useState<RoutineState | null>(null);
  const snapshot = (): RoutineState => beforeStart ?? { entries, stepLimit, started };
  const restore = (before: RoutineState) => () => {
    setRoutineActives({ entries: before.entries, stepLimit: before.stepLimit, started: before.started });
    setAddedHere(false);
  };
  const tell = (title: string, line: string, undo?: () => void) => setNotice({ id: Date.now(), title, line, undo });
  const commit = (next: RoutineEntry[], before: RoutineState, title: string, line: string, extra?: { stepLimit?: StepLimit; started?: boolean }) => {
    setRoutineActives({ entries: next, ...extra });
    setSheet(null);
    setBeforeStart(null);
    setAddedHere(true);
    tell(title, line, restore(before));
  };

  /** Runs the checks on Add against this routine state, and acts on the answer. `before` is what Undo puts back. */
  const add = (state: RoutineState, before: RoutineState, startedNow = false) => {
    const plan = planAdd({ active, state, hasRoutine: isPersonalized(profile), ownProduct: ownProduct?.name ?? null, answers });
    const extra = startedNow ? { stepLimit: state.stepLimit, started: true } : undefined;
    const addedTitle = startedNow ? "Routine started" : "Added to your routine";
    switch (plan.kind) {
      case "owned":
        return;
      case "start":
        setSheet({ kind: "start" });
        return;
      case "add":
        commit(withAdded(state.entries, plan.entry), before, addedTitle, placeLine(plan.entry), extra);
        return;
      case "full":
        if (startedNow) {
          setRoutineActives({ entries: state.entries, ...extra });
          setBeforeStart(before);
        }
        setSheet(plan);
        return;
      case "clash": {
        const otherEntry = state.entries.find((entry) => entry.active === plan.with);
        if (plan.level === "quiet") {
          const next = withAlternated(state.entries, plan.entry, plan.with);
          commit(next, before, "Added on different nights", alternateLine(next, plan.with), extra);
          return;
        }
        if (startedNow) {
          setRoutineActives({ entries: state.entries, ...extra });
          setBeforeStart(before);
        }
        // The calendar on the sheet: how alternating would place the two.
        const assumed = otherEntry ?? (hasStory(activeOf(plan.with)) ? entryFor(activeOf(plan.with) as StoryActive, sensitivityOf(answers)) : null);
        const preview = assumed ? withAlternated([assumed], plan.entry, plan.with) : [plan.entry];
        setSheet({
          ...plan,
          preview: {
            otherDays: preview.find((entry) => entry.active === plan.with)?.days ?? [],
            newDays: preview.find((entry) => entry.active === active.key)?.days ?? plan.entry.days,
          },
        });
        return;
      }
    }
  };

  /** "BHA Mon · Thu, retinoid Tue · Fri", or, for an active they use outside the routine, where it goes and that the other keeps its own nights. */
  const alternateLine = (next: RoutineEntry[], other: ActiveKey) => {
    const mine = next.find((entry) => entry.active === active.key)!;
    const theirs = next.find((entry) => entry.active === other);
    const otherName = other === "retinoids" ? "retinoid" : activeOf(other).name;
    return theirs ? `${active.name} ${daysLabel(mine.days)}, ${otherName} ${daysLabel(theirs.days)}` : `${active.name} ${daysLabel(mine.days)}. Keep ${yours(other)} to other nights.`;
  };

  const onAdd = () => add(snapshot(), snapshot());
  // Slides up over the story, with an X to come back to it (owner).
  const seeRoutine = () => router.push({ pathname: "/routine", params: { from: "story" } });
  const checkProduct = () => openScanner({ mode: "photo", from: "journey", need: encodeNeed(needFrom(answers)) });

  // ── Moving through the cards ──
  const next = () => setIndex((i) => Math.min(total - 1, i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));
  const close = () => router.back();
  const [screenReader, setScreenReader] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled().then((on) => live && setScreenReader(on), () => undefined);
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", setScreenReader);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);

  // Swipe down closes: the story follows the finger, and springs back if let go early.
  const [drag] = useState(() => new Animated.Value(0));
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > CLOSE_DRAG) router.back();
        else Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start(),
    }),
  );

  const checkLink = (
    <Pressable onPress={checkProduct} accessibilityRole="button" accessibilityLabel="Have one in mind? Check a product" style={{ height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }} className="active:opacity-70">
      <Text style={{ fontSize: TYPE.body, color: MUTED }}>Have one in mind?</Text>
      <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: BUTTON.primary.fill }}>Check a product</Text>
    </Pressable>
  );

  const actions = active.basic ? (
    // Sunscreen is a basic step of every routine: already in, never added.
    <>
      <InRoutineLine label="Already in your routine" detail={active.basic.when} />
      <SeeRoutineButton onPress={seeRoutine} />
      {checkLink}
    </>
  ) : inRoutine && !addedHere ? (
      <>
        <InRoutineLine label="In your routine" detail={ownProduct?.name} />
        <SeeRoutineButton onPress={seeRoutine} />
      </>
    ) : (
      <>
        {inRoutine ? (
          <SeeRoutineButton onPress={seeRoutine} />
        ) : (
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={`Add ${active.name} to my routine`}
            style={{ height: BUTTON_HEIGHT, borderRadius: BUTTON_HEIGHT / 2, backgroundColor: BUTTON.primary.fill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
            className="active:opacity-90"
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M12 5v14M5 12h14" stroke={WHITE} strokeWidth={2.6} strokeLinecap="round" />
            </Svg>
            <Text style={{ fontSize: 16, fontWeight: "600", color: WHITE }}>Add {active.name} to my routine</Text>
          </Pressable>
        )}
        {checkLink}
      </>
    );

  const body = {
    why: <WhyCard active={active} goal={goal.label} />,
    start: <StartCard active={active} answers={answers} />,
    when: <WhenCard active={active} />,
    pairs: <PairsCard active={active} />,
    avoid: <AvoidCard active={active} />,
    shop: <ShopCard active={active} actions={actions} />,
  }[card];

  const last = index === total - 1;
  const opacity = drag.interpolate({ inputRange: [0, 400], outputRange: [1, 0.6], extrapolate: "clamp" });

  return (
    <Animated.View {...responder.panHandlers} style={{ flex: 1, backgroundColor: CANVAS, transform: [{ translateY: drag }], opacity }}>
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 16, gap: 12 }}>
        {/* Where you are: one bar a card, filled up to this one. */}
        <View accessibilityLabel={`Card ${index + 1} of ${total}`} style={{ flexDirection: "row", gap: 4 }}>
          {cards.map((key, i) => (
            <View key={key} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= index ? INK : SKIN_NEEDS.line }} />
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Image source={familyOf(active).picture} contentFit="contain" accessibilityLabel="" style={{ width: 30, height: 30 }} />
          <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>{active.name}</Text>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: TYPE.caption, color: MUTED_FAINT }}>
            {active.sub}
          </Text>
          <Text style={{ marginLeft: "auto", fontSize: TYPE.caption, fontWeight: "600", color: MUTED_FAINT }}>
            {index + 1} / {total}
          </Text>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close the story"
            hitSlop={6}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: SURFACE, alignItems: "center", justifyContent: "center", ...ICON_SHADOW }}
            className="active:opacity-80"
          >
            <CloseCross />
          </Pressable>
        </View>
      </View>

      {/* The card. Its left third goes back and the rest goes on, like Stories;
          its own buttons and links take their taps first. */}
      <Pressable
        accessible={false}
        onPress={(event) => (event.nativeEvent.pageX < width / 3 ? back() : last ? undefined : next())}
        style={{ flex: 1 }}
      >
        <FitScrollView key={card} contentContainerStyle={{ flexGrow: 1, paddingBottom: last ? Math.max(34, insets.bottom + 8) : 0 }}>
          {body}
        </FitScrollView>
      </Pressable>

      {last ? null : screenReader ? (
        // VoiceOver can't tap a third of the screen: visible Back and Next (hand-off).
        <View style={{ height: 56, marginBottom: Math.max(12, insets.bottom), flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16 }}>
          <Pressable onPress={back} disabled={index === 0} accessibilityRole="button" accessibilityLabel="Back" accessibilityState={{ disabled: index === 0 }} style={{ minWidth: 88, justifyContent: "center" }}>
            <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: index === 0 ? MUTED_FAINT : BUTTON.primary.fill }}>Back</Text>
          </Pressable>
          <Pressable onPress={next} accessibilityRole="button" accessibilityLabel="Next" style={{ minWidth: 88, alignItems: "flex-end", justifyContent: "center" }}>
            <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: BUTTON.primary.fill }}>Next</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable accessible={false} onPress={next} style={{ height: 56, marginBottom: Math.max(12, insets.bottom), alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>Tap to continue</Text>
        </Pressable>
      )}

      {/* Under the progress and the header row (the hand-off has it over them): there it covered the close button, and a tap meant to close undid the add. */}
      <TopToast notice={notice} onDone={clearNotice} top={64} />

      {/* ── The sheets over the last card ── */}
      <StartRoutineSheet
        visible={sheet?.kind === "start"}
        onClose={() => setSheet(null)}
        active={active.key}
        onStart={(limit) => {
          const before = snapshot();
          add({ entries, stepLimit: limit, started: true }, before, true);
        }}
      />
      {sheet?.kind === "full" ? (
        <SwapOrAddSheet
          visible
          onClose={() => setSheet(null)}
          taken={sheet.taken.active}
          active={active.key}
          time={sheet.entry.time}
          stepsNow={sheet.stepsNow}
          stepsAfter={sheet.stepsAfter}
          suggest={sheet.suggest}
          gentler={active.gentleness < activeOf(sheet.taken.active).gentleness && sensitivityOf(answers) !== "none"}
          onSwap={() => commit(withSwapped(entries, sheet.taken.active, sheet.entry), snapshot(), "Swapped into your routine", `${active.name} replaces ${inSentence(activeOf(sheet.taken.active).name)}`)}
          onAdd={() => commit(withAdded(entries, sheet.entry), snapshot(), "Added to your routine", placeLine(sheet.entry))}
        />
      ) : null}
      {sheet?.kind === "clash" && sheet.level === "alternate" ? (
        <AlternateSheet
          visible
          onClose={() => setSheet(null)}
          active={active.key}
          other={sheet.with}
          otherDays={sheet.preview.otherDays}
          newDays={sheet.preview.newDays}
          onAlternate={() => {
            const nextEntries = withAlternated(entries, sheet.entry, sheet.with);
            commit(nextEntries, snapshot(), "Added on different nights", alternateLine(nextEntries, sheet.with));
          }}
          onSwap={() => swapFor(sheet)}
        />
      ) : null}
      {sheet?.kind === "clash" && sheet.level === "swap" ? (
        <OneAtATimeSheet
          visible
          onClose={() => setSheet(null)}
          active={active.key}
          other={sheet.with}
          inRoutine={sheet.inRoutine}
          onSwap={() => swapFor(sheet)}
          onNotNow={() => {
            // Not now stars it (hand-off), to come back to.
            const wasSaved = useAppStore.getState().savedIngredients.includes(active.save);
            saveIngredient(active.save);
            setSheet(null);
            tell("Saved to Ingredients", `${active.name}, for later`, wasSaved ? undefined : () => toggleSavedIngredient(active.save));
          }}
        />
      ) : null}
    </Animated.View>
  );

  /** Swap after a clash: the other active out, this one in on its own days. One they use outside the routine can't be taken out here: this one goes in, to use in its place. */
  function swapFor(plan: Extract<AddPlan, { kind: "clash" }>) {
    if (plan.inRoutine) commit(withSwapped(entries, plan.with, plan.entry), snapshot(), "Swapped into your routine", `${active.name} replaces ${inSentence(activeOf(plan.with).name)}`);
    else commit(withAdded(entries, plan.entry), snapshot(), "Added to your routine", `Use it in place of ${yours(plan.with)}`);
  }
}

/** "✓ In your routine · Clear Days Gel Cleanser" (hand-off 7f). */
function InRoutineLine({ label, detail }: { label: string; detail?: string }) {
  return (
    <View accessible accessibilityLabel={detail ? `${label}: ${detail}` : label} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: BUTTON.primary.fill, alignItems: "center", justifyContent: "center" }}>
        <Tick size={11} color={WHITE} />
      </View>
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: TYPE.body, color: MUTED }}>
        <Text style={{ fontWeight: "600", color: INK }}>{label}</Text>
        {detail ? ` · ${detail}` : ""}
      </Text>
    </View>
  );
}

function SeeRoutineButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="See my routine"
      style={{ height: BUTTON_HEIGHT, borderRadius: BUTTON_HEIGHT / 2, backgroundColor: SKIN_NEEDS.sage, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
      className="active:opacity-85"
    >
      <Text style={{ fontSize: 16, fontWeight: "600", color: SKIN_NEEDS.chosenInk }}>See my routine</Text>
    </Pressable>
  );
}

