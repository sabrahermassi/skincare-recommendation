import { Image } from "expo-image";
import { router, useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BounceCard } from "@/components/BounceCard";
import { FitScrollView } from "@/components/FitScrollView";
import { StartRoutineCard, TodayRoutineCard } from "@/components/home/RoutineCard";
import { TipEnvelope, TipNote } from "@/components/home/SkincareTip";
import { Text } from "@/components/Text";
import { EVENING_FROM_HOUR, timeOfDay, tipFor, todayIn } from "@/lib/home-today";
import { openScanner } from "@/lib/open-scanner";
import { isPersonalized } from "@/lib/profile";
import { assembleRoutine, basicRoutine, recallRoutine } from "@/lib/routine-builder";
import { today as weekday } from "@/lib/skin-needs";
import { tabBarClearance, tabRootTop } from "@/lib/tab-bar";
import { CANVAS, HAND_FONT_BOLD, HOME_TILE, INK, MUTED, SPACE, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// The two tiles' watercolours (transparent ground).
const SCAN_ART = require("@/assets/illustrations/home-scan-tube.webp");
const ACTIVES_ART = require("@/assets/illustrations/home-skin-needs.webp");

// How long after Home shows the screens its cards open are drawn in the background.
const PREFETCH_AFTER_MS = 600;
// Read off the hand-off (handoff_home_and_tip).
const TILE_RADIUS = 20;

/**
 * Home (handoff_home_and_tip): "Hi there!" in the hand face; one top card —
 * "Start your routine" with no routine yet, today's routine once there is
 * one; Explore's two square tiles, Scan Any Product and Find Your Actives;
 * and the skincare tip in its envelope. Cards dip when pressed and spring
 * back (`BounceCard`). It scrolls only when the content is taller than the
 * screen.
 *
 * "A routine" is what the routine screen shows steps for (owner): a skin
 * profile, or a routine started from a Skin needs story.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  // The screens the top card and the actives tile open are drawn ahead of the
  // tap (owner: a card must open at once), a moment after Home itself has
  // painted. Not the scanner: drawing it would switch the camera on.
  useEffect(() => {
    const timer = setTimeout(() => {
      router.prefetch("/routine");
      router.prefetch("/journey");
    }, PREFETCH_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const now = useHomeClock();
  // Read again each time Home comes back into view, so it follows a routine just built or changed.
  useIsFocused();
  const profile = useAppStore((s) => s.profile);
  const entries = useAppStore((s) => s.routineActives);
  const started = useAppStore((s) => s.routineStarted);
  const personalized = isPersonalized(profile);
  const hasRoutine = personalized || started || entries.length > 0;
  // The routine the routine screen built last for this profile; until it has
  // built one, the same steps with each active step's first choice.
  const routine = hasRoutine ? (personalized ? (recallRoutine(profile) ?? assembleRoutine([], profile)) : basicRoutine()) : null;
  const today = routine ? todayIn(routine, timeOfDay(now), weekday(now), entries) : null;
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
        <Text accessibilityRole="header" style={{ paddingHorizontal: 4, fontFamily: HAND_FONT_BOLD, fontSize: TYPE.display, lineHeight: 44, color: INK }}>
          Hi there!
        </Text>

        {/* One top card, never both (hand-off). */}
        <View style={{ marginTop: SPACE.gutter }}>{today ? <TodayRoutineCard today={today} onPress={openRoutine} /> : <StartRoutineCard onPress={openRoutine} />}</View>

        <Text accessibilityRole="header" style={{ marginTop: SPACE.section, paddingHorizontal: 4, fontSize: TYPE.title, fontWeight: "600", color: INK }}>
          Explore
        </Text>
        <View style={{ flexDirection: "row", gap: SPACE.block, marginTop: SPACE.block }}>
          <Tile label="Scan Any Product" description="Barcode or label" art={SCAN_ART} fill={HOME_TILE.scan} onPress={() => openScanner()} />
          <Tile label="Find Your Actives" description="Ingredients that suit you" art={ACTIVES_ART} fill={HOME_TILE.actives} onPress={() => router.push("/journey")} />
        </View>

        <TipEnvelope
          tip={tip}
          read={read}
          onOpen={() => {
            setTipRead(tip.id);
            setTipOpen(true);
          }}
        />
      </FitScrollView>
      <TipNote tip={tip} visible={tipOpen} onClose={() => setTipOpen(false)} />
    </View>
  );
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
function Tile({ label, description, art, fill, onPress }: { label: string; description: string; art: number; fill: string; onPress: () => void }) {
  return (
    <BounceCard
      onPress={onPress}
      pressedScale={0.94}
      accessibilityLabel={label}
      grow
      style={{ aspectRatio: 1, borderRadius: TILE_RADIUS, backgroundColor: fill, paddingBottom: 14, overflow: "hidden" }}
    >
      <View style={{ flex: 1, paddingTop: 10, paddingHorizontal: 10 }}>
        <Image source={art} contentFit="contain" accessibilityLabel="" style={{ flex: 1 }} />
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ paddingTop: 6, paddingHorizontal: 14, fontSize: TYPE.card, fontWeight: "600", color: INK }}>
        {label}
      </Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ paddingHorizontal: 14, fontSize: TYPE.caption, lineHeight: 17.5, color: MUTED }}>
        {description}
      </Text>
    </BounceCard>
  );
}
