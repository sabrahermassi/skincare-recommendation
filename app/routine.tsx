import { Image } from "expo-image";
import { router, useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { PageTitle } from "@/components/PageTitle";
import { BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { Text } from "@/components/Text";
import { fetchProducts } from "@/data/api";
import type { ProductWithIngredients, SkinProfile } from "@/data/types";
import { openQuiz } from "@/lib/open-quiz";
import { openScanner } from "@/lib/open-scanner";
import { isPersonalized, profileHeadline } from "@/lib/profile";
import { assembleRoutine, recallRoutine, rememberRoutine, routineCandidates, routinePick, ROUTINE_STEPS, type Routine as BuiltRoutine, type RoutinePick, type RoutineSlot, type TimeOfDay } from "@/lib/routine-builder";
import { CANVAS, CANVAS_GLASS, CARD_RADIUS, DIVIDER, INK, LINK, MUTED, MUTED_FAINT, ROUTINE_SWITCH, scoreColours, SPACE, SURFACE, TOUCH_TARGET, TYPE, VERDICT_LABEL, WHITE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";
import { FitScrollView } from "@/components/FitScrollView";
import { GlassHeader } from "@/components/GlassHeader";
import { TEST_STEPS, useTestRoutine } from "@/lib/dev-test-data";

// A woman at her mirror (v9: design_handoff_formee_v9, routine-empty-mirror).
const ROUTINE_ART = require("@/assets/illustrations/routine-empty-mirror.webp");

// The faded bottle each step's card shows until a product is picked for it
// (v9, read off the hand-off).
const STEP_BOTTLE: Record<string, number> = {
  "First cleanse": require("@/assets/illustrations/bottle-cleanser.png"),
  Cleansing: require("@/assets/illustrations/bottle-cleanser.png"),
  Serum: require("@/assets/illustrations/bottle-serum.png"),
  Treatment: require("@/assets/illustrations/bottle-serum.png"),
  Moisturiser: require("@/assets/illustrations/bottle-moisturizer.png"),
  Sunscreen: require("@/assets/illustrations/bottle-sunscreen.png"),
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
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      {isPersonalized(profile) ? (
        <Steps />
      ) : (
        <>
          <ScreenHeader />
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

// How many products are scored between two chances for a tap to be handled.
const SCORE_BATCH = 25;

/**
 * The routine for a profile, `null` while it is being built.
 *
 * Built in small batches, and only while this screen is the one showing.
 * Scoring the catalogue in one go froze the app for as long as it took, and
 * this screen is alive when it is not on show: Home draws it ahead of the
 * tap, and the skin quiz opens over it and changes the profile with every
 * answer, so each answer froze the quiz to rebuild a routine nobody could see
 * (owner, 2 October 2026).
 */
function useRoutine(profile: SkinProfile): BuiltRoutine | null {
  const focused = useIsFocused();
  // The catalogue, read once a visit: `null` until it arrives, empty if it could not be read.
  const [products, setProducts] = useState<ProductWithIngredients[] | null>(null);
  // Bumped when a build finishes, so the remembered routine is read again.
  const [, setBuilds] = useState(0);
  const asked = useRef(false);

  useEffect(() => {
    if (!focused || asked.current) return;
    asked.current = true;
    let cancelled = false;
    fetchProducts()
      .then((all) => !cancelled && setProducts(all))
      .catch(() => !cancelled && setProducts([]));
    return () => {
      cancelled = true;
    };
  }, [focused]);

  // The routine built last time, for this very profile, shows at once (owner:
  // every visit took a second to score the catalogue again). Until this
  // visit's catalogue is in, it is taken on trust; once it is in, only if it
  // is the same catalogue.
  const routine = recallRoutine(profile, products ?? undefined);
  const fresh = routine !== null;
  useEffect(() => {
    if (!focused || products === null || fresh) return;
    const candidates = routineCandidates(products);
    const picks: RoutinePick[] = [];
    let next = 0;
    let timer: ReturnType<typeof setTimeout>;
    const batch = () => {
      const end = Math.min(next + SCORE_BATCH, candidates.length);
      for (; next < end; next++) {
        const pick = routinePick(candidates[next], profile);
        if (pick) picks.push(pick);
      }
      if (next < candidates.length) {
        timer = setTimeout(batch, 0);
        return;
      }
      rememberRoutine(profile, products, assembleRoutine(picks, profile));
      setBuilds((count) => count + 1);
    };
    timer = setTimeout(batch, 0);
    return () => clearTimeout(timer);
  }, [focused, products, profile, fresh]);

  return routine;
}

function Steps() {
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const [time, setTime] = useState<TimeOfDay>("morning");
  const { title, tags } = profileHeadline(profile);
  // On a development build with the test data on (Profile), ten steps each way.
  const testRoutine = useTestRoutine();
  const routine = useRoutine(profile);
  const steps: readonly RoutineSlot[] = testRoutine
    ? TEST_STEPS[time].map((label) => ({ key: label, label, note: null, picks: [] }))
    : (routine?.[time] ?? ROUTINE_STEPS[time].map((step) => ({ ...step, note: null, picks: [] })));
  const [headerHeight, setHeaderHeight] = useState(0);
  const [scrollY] = useState(() => new Animated.Value(0));
  const [onScroll] = useState(() => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false }));
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
            Steps for today
          </Text>
          <Text style={{ fontSize: TYPE.caption, color: MUTED }}>{time === "morning" ? "good morning" : "wind down"}</Text>
        </View>

        <View>
          {steps.map((step, i) => (
            <StepCard key={`${time}-${step.key}`} number={i + 1} slot={step} finding={!testRoutine && routine === null} last={i === steps.length - 1} />
          ))}
        </View>
        <Text style={{ paddingTop: SPACE.gutter, paddingHorizontal: SPACE.text, textAlign: "center", fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>
          Picked from our catalogue for your skin profile. Scan a product to see whether it fits a step.
        </Text>
      </FitScrollView>
      {/* Back, the title, the skin profile and the Morning | Evening switch
          hold still on glass; the steps pass behind them (owner). */}
      <GlassHeader scrollY={scrollY} solid={CANVAS} glass={CANVAS_GLASS} onHeight={setHeaderHeight}>
        <ScreenHeader />
        {/* The 12pt under the switch is glass too, so nothing is cut at the switch's own edge. */}
        <View style={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.text, paddingBottom: SPACE.block }}>
          <PageTitle title="Your skincare routine" />

          {/* What the routine is built from; tapping it changes the answers. */}
          <Pressable
            onPress={() => router.push("/skin-profile")}
            accessibilityRole="button"
            // A stone card like the steps below, pressed to the row tint; the fill
            // is a class so the pressed state can replace it.
            className="bg-surface active:bg-row-pressed"
            style={{ marginTop: SPACE.block, flexDirection: "row", alignItems: "center", gap: SPACE.block, borderRadius: CARD_RADIUS, paddingVertical: SPACE.block, paddingHorizontal: SPACE.gutter }}
          >
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>Your skin profile</Text>
              <Text numberOfLines={1} style={{ fontSize: TYPE.caption, color: MUTED }}>
                {[title, ...tags].join(" · ")}
              </Text>
            </View>
          </Pressable>

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
 * the next step, then a stone card: the step's name in small capitals, the
 * product picked for it (tapping it opens the product, as a scan would), for
 * a serum or treatment the actives to look for, any other options, and a way
 * to scan one. With nothing picked, the step's bottle sits faded on the right.
 */
function StepCard({ number, slot, finding, last }: { number: number; slot: RoutineSlot; finding: boolean; last: boolean }) {
  const [more, setMore] = useState(false);
  const { label, note, picks } = slot;
  const [pick, ...others] = picks;
  return (
    <View style={{ flexDirection: "row", alignItems: "stretch", gap: SPACE.block }}>
      <View style={{ width: 28, alignItems: "center", paddingTop: 14 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ROUTINE_SWITCH.stepFill, alignItems: "center", justifyContent: "center" }}>
          <Text maxFontSizeMultiplier={1} style={{ fontSize: TYPE.caption, fontWeight: "700", color: LINK }}>
            {number}
          </Text>
        </View>
        {last ? null : <View style={{ flex: 1, minHeight: 12, marginTop: 6, borderLeftWidth: 2, borderStyle: "dotted", borderColor: ROUTINE_SWITCH.stepLine }} />}
      </View>
      <View style={{ flex: 1, minHeight: 72, marginBottom: last ? 0 : SPACE.block, flexDirection: "row", alignItems: "center", gap: SPACE.block, borderRadius: CARD_RADIUS, backgroundColor: SURFACE, paddingVertical: SPACE.block, paddingHorizontal: SPACE.gutter }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={{ fontSize: TYPE.caption, fontWeight: "600", letterSpacing: 0.78, textTransform: "uppercase", color: MUTED }}>
            {label}
          </Text>
          {pick ? <PickRow pick={pick} /> : <Text style={{ fontSize: TYPE.body, lineHeight: 20, color: INK }}>{finding ? "Finding products…" : "No product picked yet."}</Text>}
          {/* A serum or treatment: the actives that matter, whether or not we had a product to name. */}
          {note ? <Text style={{ fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>{note}</Text> : null}
          {more ? others.map((other) => <PickRow key={other.product.id} pick={other} divided />) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: SPACE.gutter }}>
            {others.length > 0 ? (
              <Pressable
                onPress={() => setMore((open) => !open)}
                accessibilityRole="button"
                accessibilityState={{ expanded: more }}
                accessibilityLabel={more ? `Fewer options for ${label.toLowerCase()}` : `${others.length} more for ${label.toLowerCase()}`}
                hitSlop={8}
                style={{ minHeight: 28, justifyContent: "center" }}
                className="active:opacity-70"
              >
                <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>{more ? "Fewer" : `${others.length} more`}</Text>
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
        </View>
        {!pick && STEP_BOTTLE[label] ? <Image source={STEP_BOTTLE[label]} contentFit="contain" accessibilityLabel="" style={{ width: 52, height: 60, opacity: 0.4 }} /> : null}
      </View>
    </View>
  );
}

/** A product picked for a step: its bottle, the brand over the name, and its skin match. It opens the product screen. */
function PickRow({ pick, divided = false }: { pick: RoutinePick; divided?: boolean }) {
  const { product, match } = pick;
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${product.brand} ${product.name}. ${VERDICT_LABEL[match.verdict]}, ${match.score} out of 100`}
      style={{ minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: SPACE.block, paddingVertical: SPACE.text, borderTopWidth: divided ? 0.5 : 0, borderTopColor: DIVIDER }}
      className="active:opacity-70"
    >
      <ProductThumbnail product={product} size={44} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>
          {product.brand}
        </Text>
        <Text numberOfLines={2} style={{ fontSize: TYPE.body, fontWeight: "600", lineHeight: 20, color: INK }}>
          {product.name}
        </Text>
        <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: scoreColours(match.verdict).deep }}>
          {VERDICT_LABEL[match.verdict]} · {match.score}/100
        </Text>
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
