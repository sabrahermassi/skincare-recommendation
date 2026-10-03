import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BuildingRoutine } from "@/components/BuildingRoutine";
import { DottedLine } from "@/components/DottedLine";
import { EmptyState } from "@/components/EmptyState";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { PageTitle } from "@/components/PageTitle";
import { BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { StoryAwareHeader } from "@/components/ScreenHeader";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { Text } from "@/components/Text";
import type { SkinProfile } from "@/data/types";
import { openQuiz } from "@/lib/open-quiz";
import { openScanner } from "@/lib/open-scanner";
import { isPersonalized } from "@/lib/profile";
import { prepareRoutine } from "@/lib/routine-build";
import { activeLine, activeStepKey, basicRoutine, pickHolding, placeId, recallRoutine, recommendable, type Routine as BuiltRoutine, type RoutinePick, type RoutineSlot, type TimeOfDay } from "@/lib/routine-builder";
import { activeOf, activesOn, DAY_LETTERS, DAY_NAMES, hasStory, nextActiveDay, STEP_LIMITS, today, type RoutineEntry, type StoryActive } from "@/lib/skin-needs";
import { matchProduct } from "@/lib/matching";
import { CANVAS, CANVAS_GLASS, CARD_RADIUS, CHOSEN, DISPLAY_FONT, INK, LINK, MUTED, MUTED_FAINT, ROUTINE_SWITCH, scoreColours, SKIN_NEEDS, SPACE, SURFACE, TOUCH_TARGET, TYPE, VERDICT_LABEL, WARN, WHITE } from "@/lib/tokens";
import { useOwnProducts } from "@/lib/use-own-products";
import { useAppStore } from "@/store/useAppStore";
import { FitScrollView } from "@/components/FitScrollView";
import { GlassHeader } from "@/components/GlassHeader";
import { TEST_STEPS, useTestRoutine } from "@/lib/dev-test-data";

// A woman at her mirror (v9: design_handoff_formee_v9, routine-empty-mirror).
const ROUTINE_ART = require("@/assets/illustrations/routine-empty-mirror.webp");

// The faded bottle each step's card shows until a product is picked for it
// (v9, read off the hand-off).
// By step key (`lib/routine-builder.ts`), and by label for the development test steps.
const CLEANSER_BOTTLE = require("@/assets/illustrations/bottle-cleanser.png");
const SERUM_BOTTLE = require("@/assets/illustrations/bottle-serum.png");
const MOISTURISER_BOTTLE = require("@/assets/illustrations/bottle-moisturizer.png");
const SUNSCREEN_BOTTLE = require("@/assets/illustrations/bottle-sunscreen.png");
const STEP_BOTTLE: Record<string, number> = {
  "first-cleanse": CLEANSER_BOTTLE,
  cleanse: CLEANSER_BOTTLE,
  serum: SERUM_BOTTLE,
  treatment: SERUM_BOTTLE,
  moisturise: MOISTURISER_BOTTLE,
  sunscreen: SUNSCREEN_BOTTLE,
  "First cleanse": CLEANSER_BOTTLE,
  Cleansing: CLEANSER_BOTTLE,
  Serum: SERUM_BOTTLE,
  Treatment: SERUM_BOTTLE,
  Moisturiser: MOISTURISER_BOTTLE,
  Sunscreen: SUNSCREEN_BOTTLE,
  "Night care": require("@/assets/illustrations/bottle-night-mask.png"),
};

/**
 * Skincare routine — opened from its card on Home. With no skin profile yet it
 * asks for one ("Take the skin quiz" opens the quiz, which closes back here);
 * with one, it lays out the morning and evening steps (v9), each with the
 * catalogue's best matches for that skin (`lib/routine-builder.ts`). A serum
 * or treatment step also says which actives to look for, since the catalogue
 * often has none to name; every step keeps a way to scan one.
 */
export default function Routine() {
  const profile = useAppStore((s) => s.profile);
  // A routine begun from a Skin needs story stands without a skin profile:
  // its steps, with nothing picked for them, and the actives added there.
  const fromStory = useAppStore((s) => s.routineStarted || s.routineActives.length > 0);
  const personalized = isPersonalized(profile);
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      {personalized || fromStory ? (
        <Steps personalized={personalized} />
      ) : (
        <>
          <StoryAwareHeader />
          <EmptyProfile />
        </>
      )}
    </View>
  );
}

function EmptyProfile() {
  return (
    <FitScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: SPACE.text, paddingBottom: 48 }}>
      <View style={{ paddingHorizontal: SPACE.gutter }}>
        <PageTitle title="Your skincare routine" />
      </View>
      {/* In the middle of the room under the title (owner), not hard against it. */}
      <View style={{ flex: 1, justifyContent: "center", paddingTop: SPACE.text }}>
        <EmptyState
          art={ROUTINE_ART}
          // As big as the screen allows (owner), inside the page gutter. The
          // drawing's weight sits 11px right of the middle of its 900px
          // canvas (measured), so it is moved left to look centred.
          artFull
          artShift={-4}
          title="Your skin profile is empty"
          line="Fill it in to create a skincare routine made just for you."
          action={<PrimaryButton label="Take the skin quiz" onPress={() => openQuiz("routine")} style={{ width: BUTTON_WIDTH.secondary }} />}
        />
      </View>
    </FitScrollView>
  );
}

/**
 * The routine for a profile, `null` until it is built.
 *
 * Asked for only while this screen is the one showing. It is alive when it is
 * not on show: Home draws it ahead of the tap, and the skin quiz opens over it
 * and changes the profile with every answer, so building on every change froze
 * the quiz to make a routine nobody could see (owner, 2 October 2026). The
 * routine built last, for this very profile, is there at once.
 */
function useRoutine(profile: SkinProfile, personalized: boolean): { routine: BuiltRoutine | null; /** False when the catalogue could not be read. */ loaded: boolean; retry: () => void } {
  const focused = useIsFocused() && personalized;
  const [built, setBuilt] = useState<{ profile: SkinProfile; routine: BuiltRoutine; loaded: boolean } | null>(null);
  // Checked this visit against the catalogue as it is now. Until then the
  // remembered routine is shown on trust, so a second visit has no wait; the
  // check is cheap when nothing changed, and builds again when something did.
  const checked = built?.profile === profile;
  useEffect(() => {
    if (!focused || checked) return;
    return prepareRoutine(profile, (made, loaded) => setBuilt({ profile, routine: made, loaded }));
  }, [focused, profile, checked]);
  if (!personalized) return { routine: BASIC_ROUTINE, loaded: true, retry: () => undefined };
  return { routine: checked ? built.routine : recallRoutine(profile), loaded: checked ? built.loaded : true, retry: () => setBuilt(null) };
}

const BASIC_ROUTINE = basicRoutine();

/** One row of the routine: a step as the builder made it, an active added from Skin needs on this day, or a rest night between two. */
type Row = { key: string; slot: RoutineSlot; added?: StoryActive; note?: string; rest?: boolean };

/**
 * The day's steps (design_handoff "october 3d", R1–R3). The basics are the
 * same every day; only the active step changes. With actives added from Skin
 * needs, it shows the day's ("Tonight's active"), or a rest night and when
 * the next one is; a morning with one says not to skip the sunscreen.
 * Without any, the builder's own step stands.
 */
function rowsFor(routine: BuiltRoutine, time: TimeOfDay, day: number, entries: readonly RoutineEntry[]): Row[] {
  const activeKey = activeStepKey(time);
  const timed = entries.filter((entry) => entry.time === time);
  const today = activesOn(entries, time, day)
    .map((entry) => activeOf(entry.active))
    .filter(hasStory);
  return routine[time].flatMap((slot): Row[] => {
    if (slot.key === "sunscreen" && today.length > 0) {
      return [{ key: slot.key, slot: { ...slot, label: "Sunscreen · don’t skip" }, note: `SPF 50 keeps ${today.map((active) => active.name).join(" and ")} working.` }];
    }
    if (slot.key !== activeKey || timed.length === 0) return [{ key: slot.key, slot }];
    if (today.length === 0) {
      const next = nextActiveDay(entries, time, day);
      const name = next ? activeOf(next.entry.active).name : "";
      return [
        {
          key: slot.key,
          slot: { ...slot, label: time === "evening" ? "Rest night" : "Rest morning", active: null, pick: null },
          note: next ? `No active ${time === "evening" ? "tonight" : "this morning"}. Next ${name}: ${DAY_NAMES[next.day]}.` : undefined,
          rest: true,
        },
      ];
    }
    return today.map((active) => ({
      key: `${slot.key}-${active.key}`,
      slot: {
        ...slot,
        label: time === "evening" ? "Tonight’s active" : "Today’s active",
        active: { name: active.name, why: capitalised(active.story.shopping.routine), alternatives: [], caution: null },
        pick: pickHolding(routine, time, active),
      },
      added: active,
    }));
  });
}

function capitalised(line: string): string {
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}`;
}

/** A step's own product: its id, and the product when it could be read. */
type OwnPick = { id: string; pick: RoutinePick | null };

function Steps({ personalized }: { personalized: boolean }) {
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  // Opened from a Skin needs story: the skin profile from here slides up with its own X too (owner).
  const fromStory = useLocalSearchParams<{ from?: string }>().from === "story";
  const [time, setTime] = useState<TimeOfDay>("morning");
  // The routine by day (R1): today, when it opens.
  const [day, setDay] = useState(() => today());
  const entries = useAppStore((s) => s.routineActives);
  const removeRoutineActive = useAppStore((s) => s.removeRoutineActive);
  const byDay = entries.length > 0;
  // On a development build with the test data on (Profile), ten steps each way.
  const testRoutine = useTestRoutine();
  const { routine, loaded, retry } = useRoutine(profile, personalized);
  const steps: readonly Row[] = testRoutine
    ? TEST_STEPS[time].map((label) => ({ key: label, slot: { key: label, label, active: null, pick: null } }))
    : routine
      ? rowsFor(routine, time, day, entries)
      : [];
  // The products the person put in a step themselves stand in front of ours.
  const routinePicks = useAppStore((s) => s.routinePicks);
  const removeFromRoutine = useAppStore((s) => s.removeFromRoutine);
  const ownProducts = useOwnProducts(Object.values(routinePicks));
  const ownFor = (key: string): OwnPick | null => {
    const id = routinePicks[placeId(time, key)];
    if (!id) return null;
    const product = ownProducts.found.get(id);
    if (product) return { id, pick: { product, match: matchProduct(product, profile) } };
    // Asked for and not there: it could not be read, or the catalogue no longer has it.
    return ownProducts.settledFor === ownProducts.wanted ? { id, pick: null } : null;
  };
  const [headerHeight, setHeaderHeight] = useState(0);
  const [scrollY] = useState(() => new Animated.Value(0));
  const [onScroll] = useState(() => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false }));
  // Not shown until it is built (owner): the same picture and words as the
  // skin quiz's closing screen, for as long as the building takes.
  if (!testRoutine && routine === null) {
    return (
      <>
        <StoryAwareHeader />
        <BuildingRoutine title="Building your skincare routine…" line="Putting together your morning and evening steps." />
      </>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      {/* The steps start under the fixed header and scroll up behind it. */}
      <FitScrollView
        contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: headerHeight, paddingBottom: insets.bottom + SPACE.section }}
        scrollIndicatorInsets={{ top: headerHeight }}
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        <View style={{ paddingTop: SPACE.section - SPACE.block, paddingBottom: SPACE.block, paddingHorizontal: 4, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text accessibilityRole="header" style={{ fontSize: TYPE.caption, fontWeight: "600", letterSpacing: 0.78, textTransform: "uppercase", color: MUTED }}>
            {byDay ? `Steps for ${DAY_NAMES[day]}` : "Steps for today"}
          </Text>
          <Text style={{ fontSize: TYPE.caption, color: MUTED }}>{time === "morning" ? "good morning" : "wind down"}</Text>
        </View>

        {/* The catalogue could not be read: say so, and offer another go, rather
            than four steps that look as if nothing suits. */}
        {!testRoutine && !loaded ? (
          <View style={{ marginBottom: SPACE.block, borderRadius: CARD_RADIUS, backgroundColor: SURFACE, paddingVertical: SPACE.block, paddingHorizontal: SPACE.gutter, gap: 2 }}>
            <Text style={{ fontSize: TYPE.body, lineHeight: 20, color: INK }}>We couldn&apos;t load products, so the steps have none yet.</Text>
            <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel="Try loading products again" hitSlop={8} style={{ alignSelf: "flex-start", minHeight: 28, justifyContent: "center" }} className="active:opacity-70">
              <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        <View>
          {steps.map((row, i) => (
            <StepCard
              key={`${time}-${row.key}`}
              number={i + 1}
              slot={row.slot}
              note={row.note}
              rest={row.rest}
              own={row.rest ? null : ownFor(row.slot.key)}
              onRemove={removeFromRoutine}
              onRemoveActive={row.added ? () => removeRoutineActive(row.added!.key) : undefined}
              last={i === steps.length - 1}
            />
          ))}
        </View>
        <Text style={{ paddingTop: SPACE.gutter, paddingHorizontal: SPACE.text, textAlign: "center", fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>
          {personalized
            ? "Picked from our catalogue for your skin profile. Scan a product to see whether it fits a step, and add your own from its result."
            : "Scan a product to see whether it fits a step, and add your own from its result. Fill in your skin profile and we'll pick products for each step."}
        </Text>
        {byDay ? <StepLimitRow /> : null}
      </FitScrollView>
      {/* Back, the title, the skin profile and the Morning | Evening switch
          hold still on glass; the steps pass behind them (owner). */}
      <GlassHeader scrollY={scrollY} solid={CANVAS} glass={CANVAS_GLASS} onHeight={setHeaderHeight}>
        <StoryAwareHeader />
        {/* The 12pt under the switch is glass too, so nothing is cut at the switch's own edge. */}
        <View style={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.text, paddingBottom: SPACE.block }}>
          <PageTitle title="Your skincare routine" />

          {/* What the routine is built from; tapping it changes the answers.
              A pale sage card with its name in sage and an arrow (owner, after
              OnSkin's routine): it reads as a way in, not as a step. */}
          <Pressable
            onPress={() => (personalized ? router.push({ pathname: "/skin-profile", params: fromStory ? { from: "story" } : {} }) : openQuiz("routine"))}
            accessibilityRole="button"
            accessibilityLabel={personalized ? "Your skin profile. Your skincare routine is based on this." : "Your skin profile is empty. Fill it in to get products picked for each step."}
            style={{ marginTop: SPACE.block, minHeight: 64, flexDirection: "row", alignItems: "center", gap: SPACE.block, borderRadius: CARD_RADIUS, backgroundColor: CHOSEN.fill, paddingVertical: SPACE.block, paddingHorizontal: SPACE.gutter }}
            className="active:opacity-80"
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: TYPE.card, fontWeight: "600", color: LINK }}>Your skin profile</Text>
              <Text style={{ fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>{personalized ? "Your skincare routine is based on this." : "Fill it in to get products picked for each step."}</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={LINK} />
          </Pressable>

          {byDay ? <DayStrip day={day} onDay={setDay} entries={entries} /> : null}

          {/* Morning | Evening (v9): the thumb is a warm sun yellow in the
              morning and a night blue in the evening, with the sun and moon in
              the word's colour. */}
          <SegmentedSwitch
            tone={time === "morning" ? ROUTINE_SWITCH.morning : ROUTINE_SWITCH.evening}
            options={[
              { value: "morning", label: "Morning", icon: (on) => <SunIcon colour={on ? ROUTINE_SWITCH.sun : MUTED_FAINT} /> },
              { value: "evening", label: "Evening", icon: (on) => <MoonIcon colour={on ? WHITE : MUTED_FAINT} /> },
            ]}
            selected={time}
            onSelect={setTime}
            style={{ marginTop: SPACE.block }}
          />
        </View>
      </GlassHeader>
    </View>
  );
}

/**
 * One step (v9): its number in a sage disc on a dotted line that runs down to
 * the next step, then a stone card. The step's name in small capitals; for a
 * serum or treatment, the active to use in big letters and what it is for
 * (owner: the active says more than a product we may not have); then the
 * product for the step, the person's own if they added one and ours otherwise
 * (tapping it opens the product, as a scan would); and a way to scan one.
 * With nothing picked, the step's bottle sits faded on the right.
 */
function StepCard({
  number,
  slot,
  note,
  rest = false,
  own: ownPick,
  onRemove,
  onRemoveActive,
  last,
}: {
  number: number;
  slot: RoutineSlot;
  /** A line under the step's name: when the next active is, or why the sunscreen matters today. */
  note?: string;
  /** A rest night: no active, nothing to pick or scan. */
  rest?: boolean;
  own: OwnPick | null;
  onRemove: (id: string) => void;
  /** For an active added from Skin needs: takes it out of the routine. */
  onRemoveActive?: () => void;
  last: boolean;
}) {
  const { label, active } = slot;
  const bottle = STEP_BOTTLE[slot.key] ?? STEP_BOTTLE[label];
  const own = ownPick?.pick ?? null;
  // One product a step (owner): their own when they added one, and ours
  // otherwise. One of theirs that could not be read keeps its place, said
  // plainly, so it can still be taken out, which brings ours back.
  const pick = own ?? (ownPick ? null : slot.pick);
  // Added when it suited, and no longer something we would pick: a pregnancy
  // since, or a profile it matches poorly.
  const outgrown = own !== null && !recommendable(own.product, own.match);
  return (
    <View style={{ flexDirection: "row", alignItems: "stretch", gap: SPACE.block }}>
      <View style={{ width: 28, alignItems: "center", paddingTop: 14 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ROUTINE_SWITCH.stepFill, alignItems: "center", justifyContent: "center" }}>
          <Text maxFontSizeMultiplier={1} style={{ fontSize: TYPE.caption, fontWeight: "700", color: LINK }}>
            {number}
          </Text>
        </View>
        {last ? null : <DottedLine color={ROUTINE_SWITCH.stepLine} style={{ flex: 1, minHeight: 12, marginTop: 6 }} />}
      </View>
      <View style={{ flex: 1, minHeight: 72, marginBottom: last ? 0 : SPACE.block, flexDirection: "row", alignItems: "center", gap: SPACE.block, borderRadius: CARD_RADIUS, backgroundColor: SURFACE, paddingVertical: SPACE.block, paddingHorizontal: SPACE.gutter }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={{ fontSize: TYPE.caption, fontWeight: "600", letterSpacing: 0.78, textTransform: "uppercase", color: MUTED }}>
            {label}
          </Text>
          {note ? <Text style={{ fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>{note}</Text> : null}
          {active ? (
            <View style={{ paddingTop: 2, paddingBottom: SPACE.text, gap: 2 }}>
              <Text style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>{active.name}</Text>
              <Text style={{ fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>{activeLine(active)}</Text>
              {/* The profile does not say whether they are pregnant, and this active is one to check first. */}
              {active.caution ? <Text style={{ fontSize: TYPE.caption, lineHeight: 18, fontWeight: "600", color: WARN }}>{active.caution}</Text> : null}
            </View>
          ) : null}
          {rest ? null : pick ? (
            <PickRow pick={pick} own={own !== null} />
          ) : ownPick ? (
            <Text style={{ fontSize: TYPE.body, lineHeight: 20, color: INK }}>Your pick for this step can&apos;t be shown right now.</Text>
          ) : (
            <Text style={{ fontSize: TYPE.body, lineHeight: 20, color: INK }}>{active ? "No product to suggest yet." : "No product picked yet."}</Text>
          )}
          {outgrown ? <Text style={{ fontSize: TYPE.caption, lineHeight: 18, fontWeight: "600", color: WARN }}>We wouldn&apos;t pick this for your skin profile as it is now.</Text> : null}
          {rest ? null : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: SPACE.gutter }}>
            {onRemoveActive && active ? (
              <Pressable onPress={onRemoveActive} accessibilityRole="button" accessibilityLabel={`Take ${active.name} out of my routine`} hitSlop={8} style={{ minHeight: 28, justifyContent: "center" }} className="active:opacity-70">
                <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>Remove {active.name}</Text>
              </Pressable>
            ) : null}
            {ownPick ? (
              <Pressable onPress={() => onRemove(ownPick.id)} accessibilityRole="button" accessibilityLabel={own ? `Remove ${own.product.name} from my routine` : "Remove my pick from this step"} hitSlop={8} style={{ minHeight: 28, justifyContent: "center" }} className="active:opacity-70">
                <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>Remove</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => openScanner()}
              accessibilityRole="button"
              accessibilityLabel={`Scan one to check, for ${label.toLowerCase()}`}
              // 28pt tall like the design; the slop takes the target to 44.
              hitSlop={8}
              style={{ minHeight: 28, flexDirection: "row", alignItems: "center", gap: SPACE.text }}
              className="active:opacity-70"
            >
              <CameraIcon />
              <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>Scan one to check</Text>
            </Pressable>
          </View>
          )}
        </View>
        {/* A rest night's bottle is fainter still (hand-off R2). */}
        {!pick && !active && bottle ? <Image source={bottle} contentFit="contain" accessibilityLabel="" style={{ width: 52, height: 60, opacity: rest ? 0.15 : 0.4 }} /> : null}
      </View>
    </View>
  );
}

/**
 * The week (hand-off R1): Monday to Sunday with this week's dates, the chosen
 * day in ink, and an amber dot under each day with an active on it.
 */
function DayStrip({ day, onDay, entries }: { day: number; onDay: (day: number) => void; entries: readonly RoutineEntry[] }) {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - today(now));
  return (
    <View accessibilityRole="tablist" style={{ marginTop: SPACE.text, flexDirection: "row", gap: 4 }}>
      {DAY_LETTERS.map((letter, index) => {
        const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index).getDate();
        const on = index === day;
        // Either routine's: a morning with nothing on it still shows the week's active nights.
        const active = entries.some((entry) => entry.days.includes(index));
        return (
          <Pressable
            key={index}
            onPress={() => onDay(index)}
            accessibilityRole="tab"
            accessibilityLabel={`${DAY_NAMES[index]} ${date}${active ? ", an active" : ""}`}
            accessibilityState={{ selected: on }}
            style={{ flex: 1, height: 44, borderRadius: 14, backgroundColor: on ? INK : "transparent", alignItems: "center", justifyContent: "center", gap: 1 }}
          >
            <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 11, fontWeight: "600", lineHeight: 13, color: on ? WHITE : MUTED_FAINT }}>
              {letter}
            </Text>
            <Text maxFontSizeMultiplier={1.2} style={{ fontSize: TYPE.body, fontWeight: "600", lineHeight: 18, color: on ? WHITE : INK }}>
              {date}
            </Text>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: active ? SKIN_NEEDS.amber : "transparent" }} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** "Steps per routine": the limit chosen when the routine was started from Skin needs, which "You can change it later" promised. */
function StepLimitRow() {
  const limit = useAppStore((s) => s.routineStepLimit);
  const entries = useAppStore((s) => s.routineActives);
  const setRoutineActives = useAppStore((s) => s.setRoutineActives);
  return (
    <View style={{ marginTop: SPACE.section, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACE.block }}>
      <Text style={{ flex: 1, fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>Steps per routine, at most</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {STEP_LIMITS.map((value) => (
          <Pressable
            key={value}
            onPress={() => setRoutineActives({ entries, stepLimit: value })}
            accessibilityRole="radio"
            accessibilityLabel={`${value} steps per routine`}
            accessibilityState={{ checked: value === limit }}
            hitSlop={4}
            style={{ width: 40, height: 36, borderRadius: 12, borderWidth: value === limit ? 1.5 : 1, borderColor: value === limit ? CHOSEN.border : SKIN_NEEDS.line, backgroundColor: value === limit ? CHOSEN.fill : SURFACE, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: value === limit ? SKIN_NEEDS.chosenInk : INK }}>{value}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * A product for a step: its bottle, the brand over the name, and its skin
 * match. It opens the product screen. `own` marks the one the person added
 * themselves.
 */
function PickRow({ pick, own = false }: { pick: RoutinePick; own?: boolean }) {
  const { product, match } = pick;
  const verdict = match.score === null ? VERDICT_LABEL[match.verdict] : `${VERDICT_LABEL[match.verdict]} · ${match.score}/100`;
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${own ? "Your pick: " : ""}${product.brand} ${product.name}. ${match.score === null ? VERDICT_LABEL[match.verdict] : `${VERDICT_LABEL[match.verdict]}, ${match.score} out of 100`}`}
      style={{ minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: SPACE.block, paddingVertical: SPACE.text }}
      className="active:opacity-70"
    >
      <ProductThumbnail product={product} size={44} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>
          {own ? `Your pick · ${product.brand}` : product.brand}
        </Text>
        <Text numberOfLines={2} style={{ fontSize: TYPE.body, fontWeight: "600", lineHeight: 20, color: INK }}>
          {product.name}
        </Text>
        <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: scoreColours(match.verdict).deep }}>{verdict}</Text>
      </View>
    </Pressable>
  );
}

// The hand-off's own glyphs (v9): a lucide camera, an outline sun and moon.
function CameraIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" stroke={LINK} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={3} stroke={LINK} strokeWidth={2.1} />
    </Svg>
  );
}

function SunIcon({ colour }: { colour: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4} stroke={colour} strokeWidth={2.2} />
      <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke={colour} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

function MoonIcon({ colour }: { colour: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" stroke={colour} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}
