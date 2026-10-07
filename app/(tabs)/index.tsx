import { Image } from "expo-image";
import { router, useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BounceCard } from "@/components/BounceCard";
import { FitScrollView } from "@/components/FitScrollView";
import { HomeSkeleton } from "@/components/home/HomeSkeleton";
import { StartRoutineCard, TodayRoutineCard } from "@/components/home/RoutineCard";
import { TipEnvelope, TipNote } from "@/components/home/SkincareTip";
import { SectionLabel } from "@/components/SectionLabel";
import { Text } from "@/components/Text";
import { EVENING_FROM_HOUR, timeOfDay, tipFor, todayIn } from "@/lib/home-today";
import { openScanner } from "@/lib/open-scanner";
import { isPersonalized } from "@/lib/profile";
import type { SkinProfile } from "@/data/types";
import { prepareRoutine } from "@/lib/routine-build";
import { basicRoutine, recallRoutine, type Routine } from "@/lib/routine-builder";
import { today as weekday } from "@/lib/skin-needs";
import { tabBarClearance, tabRootTop } from "@/lib/tab-bar";
import { CANVAS, HAND_FONT_BOLD, HOME_TILE, INK, MUTED, SPACE, TYPE, RADIUS, LEADING } from "@/lib/tokens";
import { useSkinNeedsEnabled } from "@/lib/features";
import { useAppStore } from "@/store/useAppStore";

// The two tiles' watercolours (transparent ground).
const SCAN_ART = require("@/assets/illustrations/home-scan-tube.webp");
const ACTIVES_ART = require("@/assets/illustrations/home-skin-needs.webp");

// How long after Home shows the screens its cards open are drawn in the background.
const PREFETCH_AFTER_MS = 600;
// Read off the hand-off (handoff_home_and_tip).
const TILE_RADIUS = RADIUS.card;

/**
 * Home (handoff_home_and_tip): "Hi there!" in the hand face; one top card —
 * "Start your routine" with no routine yet, today's routine once there is
 * one; Explore's two square tiles, Scan Any Product and Find Your Actives;
 * and the skincare tip in its envelope. Cards dip when pressed and spring
 * back (`BounceCard`). It scrolls only when the content is taller than the
 * screen.
 *
 * "A routine" is one the person made (owner, 3 October 2026): built by
 * opening the routine with a skin profile, or started from a Skin needs
 * story. Filling in the skin profile alone, say after a scan, keeps "Start
 * your routine".
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  // Skin needs is hidden until an expert has checked it (#467).
  const skinNeeds = useSkinNeedsEnabled();
  // The screens the top card and the actives tile open are drawn ahead of the
  // tap (owner: a card must open at once), a moment after Home itself has
  // painted. Not the scanner: drawing it would switch the camera on.
  useEffect(() => {
    const timer = setTimeout(() => {
      router.prefetch("/routine");
      if (skinNeeds) router.prefetch("/journey");
    }, PREFETCH_AFTER_MS);
    return () => clearTimeout(timer);
  }, [skinNeeds]);

  const now = useHomeClock();
  // Read again each time Home comes back into view, so it follows a routine just built or changed.
  const focused = useIsFocused();
  const profile = useAppStore((s) => s.profile);
  const entries = useAppStore((s) => s.routineActives);
  const started = useAppStore((s) => s.routineStarted);
  const built = useAppStore((s) => s.routineBuilt);
  const hasPicks = useAppStore((s) => Object.keys(s.routinePicks).length > 0);
  const personalized = isPersonalized(profile);
  // A skin profile alone is not a routine (owner): only one opened from the card, or started from a Skin needs story.
  const hasRoutine = (personalized && built) || started || entries.length > 0 || hasPicks;
  const routine = useHomeRoutine(profile, personalized && hasRoutine, focused);
  const routineIn = hasRoutine ? (personalized ? routine : basicRoutine()) : null;
  // Built for a skin profile but not ready yet: grey placeholders where its card and tip will be, rather than the wrong ones or a blank.
  const pending = hasRoutine && routineIn === null;
  const today = routineIn ? todayIn(routineIn, timeOfDay(now), weekday(now), entries) : null;
  const tip = tipFor(now, today);
  const read = useAppStore((s) => s.tipRead) === tip.id;
  const setTipRead = useAppStore((s) => s.setTipRead);
  const [tipOpen, setTipOpen] = useState(false);

  const openRoutine = () => router.push("/routine");
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <FitScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: tabRootTop(insets.top), paddingHorizontal: SPACE.gutter, paddingBottom: tabBarClearance(insets.bottom) }}
        showsVerticalScrollIndicator={false}
      >
        <Text accessibilityRole="header" style={{ paddingHorizontal: SPACE.tight, fontFamily: HAND_FONT_BOLD, fontSize: TYPE.display, lineHeight: 44, color: INK }}>
          Hi there!
        </Text>

        {/* One top card, never both (hand-off). */}
        <View style={{ marginTop: SPACE.gutter }}>
          {pending ? <HomeSkeleton part="card" /> : today ? <TodayRoutineCard today={today} onPress={openRoutine} /> : <StartRoutineCard onPress={openRoutine} />}
        </View>

        <SectionLabel title="Explore" />
        <View style={{ flexDirection: "row", gap: SPACE.block }}>
          <Tile label="Scan Any Product" description="Barcode or label" art={SCAN_ART} fill={HOME_TILE.tile} wide={!skinNeeds} onPress={() => openScanner()} />
          {skinNeeds ? <Tile label="Find Your Actives" description="Ingredients that suit you" art={ACTIVES_ART} fill={HOME_TILE.tile} onPress={() => router.push("/journey")} /> : null}
        </View>

        {pending ? (
          <View style={{ marginTop: SPACE.gutter }}>
            <HomeSkeleton part="tip" />
          </View>
        ) : (
          <TipEnvelope
            tip={tip}
            read={read}
            onOpen={() => {
              setTipRead(tip.id);
              setTipOpen(true);
            }}
          />
        )}
      </FitScrollView>
      {pending ? null : <TipNote tip={tip} visible={tipOpen} onClose={() => setTipOpen(false)} />}
    </View>
  );
}

/**
 * The routine for a skin profile, the very one the routine screen lays out
 * (its active steps name the active of the best matching product), so Home
 * and the routine never disagree. The one remembered for this profile at
 * once, checked against the catalogue as it is now each time Home comes into
 * view (as the routine screen does on each visit), so a product the catalogue
 * dropped or changed does not keep deciding the card and the tip; else built
 * in small batches in the background, and null until it is ready, when Home
 * keeps its first-choice stand-in out of sight.
 */
function useHomeRoutine(profile: SkinProfile, wanted: boolean, focused: boolean): Routine | null {
  const [built, setBuilt] = useState<{ profile: SkinProfile; routine: Routine; loaded: boolean } | null>(null);
  const remembered = wanted ? recallRoutine(profile) : null;
  const ready = built?.profile === profile ? built : null;
  // When the catalogue could not be read the routine is its steps with each
  // active step's first choice: shown, not left as a skeleton, and built again
  // each time Home comes back into view until the catalogue loads.
  const retry = ready !== null && !ready.loaded;
  useEffect(() => {
    if (!wanted || !focused) return;
    if (ready?.loaded) return;
    return prepareRoutine(profile, (routine, loaded) => setBuilt({ profile, routine, loaded }));
    // `ready` only decides whether to start: a result landing must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, profile, focused, retry]);
  // Home stays mounted behind the other tabs, so the check is dropped when it
  // loses focus and made again the next time it is shown.
  useEffect(() => {
    if (!focused) setBuilt(null);
  }, [focused]);
  return ready?.routine ?? remembered;
}

/**
 * The time Home is drawn for: moved on at 3 pm and at midnight while it is
 * open, and whenever the app comes back to the front, so the card and the tip
 * turn over on their own.
 */
function useHomeClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const next = new Date(now);
    if (now.getHours() < EVENING_FROM_HOUR) next.setHours(EVENING_FROM_HOUR, 0, 0, 0);
    else next.setHours(24, 0, 0, 0);
    const timer = setTimeout(() => setNow(new Date()), next.getTime() - now.getTime());
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(new Date());
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [now]);
  return now;
}

/** One of Explore's two square tiles (hand-off): its picture filling the room above, then its name and one line. */
function Tile({ label, description, art, fill, wide = false, onPress }: { label: string; description: string; art: number; fill: string; /** Alone in its row (Skin needs hidden, #467): twice as wide as tall, not a square the width of the screen. */ wide?: boolean; onPress: () => void }) {
  return (
    <BounceCard
      onPress={onPress}
      pressedScale={0.94}
      accessibilityLabel={label}
      grow
      style={{ aspectRatio: wide ? 2 : 1, borderRadius: TILE_RADIUS, backgroundColor: fill, paddingBottom: SPACE.gutter, overflow: "hidden" }}
    >
      <View style={{ flex: 1, paddingTop: SPACE.block, paddingHorizontal: SPACE.block }}>
        <Image source={art} contentFit="contain" accessibilityLabel="" style={{ flex: 1 }} />
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ paddingTop: SPACE.text, paddingHorizontal: SPACE.gutter, fontSize: TYPE.card, fontWeight: "600", color: INK }}>
        {label}
      </Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ paddingHorizontal: SPACE.gutter, fontSize: TYPE.caption, lineHeight: LEADING.caption, color: MUTED }}>
        {description}
      </Text>
    </BounceCard>
  );
}
