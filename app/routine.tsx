import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { PageTitle } from "@/components/PageTitle";
import { BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { Text } from "@/components/Text";
import { openQuiz } from "@/lib/open-quiz";
import { openScanner } from "@/lib/open-scanner";
import { isPersonalized, profileHeadline } from "@/lib/profile";
import { CANVAS, CARD_RADIUS, INK, LINK, MUTED, MUTED_FAINT, ROW_CHEVRON, SPACE, SURFACE, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// A woman at her dressing table wondering about her products
// (new-watercolor/no_product_match_v2_transparent.png, trimmed and brought down
// to 1000px wide).
const ROUTINE_ART = require("@/assets/illustrations/routine-coming-soon.webp");
const ROUTINE_ASPECT = 1000 / 611;

type TimeOfDay = "morning" | "evening";

// The steps of each routine, in order, and the faded bottle each step's card
// shows until a product is picked for it (v9, read off the hand-off).
const STEPS: Record<TimeOfDay, string[]> = {
  morning: ["Cleansing", "Serum", "Moisturiser", "Sunscreen"],
  evening: ["Cleansing", "Treatment", "Moisturiser", "Night care"],
};
const STEP_BOTTLE: Record<string, number> = {
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
 * with one, it lays out the morning and evening steps (v9). The products for
 * each step aren't built yet, so every step shows its faded bottle and a way
 * to scan one.
 */
export default function Routine() {
  const profile = useAppStore((s) => s.profile);
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader />
      {isPersonalized(profile) ? <Steps /> : <EmptyProfile />}
    </View>
  );
}

function EmptyProfile() {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: SPACE.text, paddingBottom: 48 }}>
      <View style={{ paddingHorizontal: SPACE.gutter }}>
        <PageTitle title="Your skincare routine" />
      </View>
      {/* Top-aligned under the title (v9), not centred in the page. */}
      <View style={{ paddingTop: SPACE.text }}>
        <EmptyState
          art={ROUTINE_ART}
          aspect={ROUTINE_ASPECT}
          artWidth={354}
          title="Your skin profile is empty"
          line="Fill it in to create a skincare routine made just for you."
          action={<PrimaryButton label="Take the skin quiz" onPress={openQuiz} style={{ width: BUTTON_WIDTH.secondary }} />}
        />
      </View>
    </ScrollView>
  );
}

function Steps() {
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const [time, setTime] = useState<TimeOfDay>("morning");
  const { title, tags } = profileHeadline(profile);
  const steps = STEPS[time];
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.text, paddingBottom: insets.bottom + SPACE.section }}>
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
        <Svg width={8} height={14} viewBox="0 0 8 14" fill="none">
          <Path d="m1 1 6 6-6 6" stroke={ROW_CHEVRON} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Pressable>

      {/* Morning | Evening (v9): the plain light switch, with an outline sun
          and moon in the word's colour. */}
      <SegmentedSwitch
        tone="light"
        options={[
          { value: "morning", label: "Morning", icon: (on) => <SunIcon colour={on ? INK : MUTED_FAINT} /> },
          { value: "evening", label: "Evening", icon: (on) => <MoonIcon colour={on ? INK : MUTED_FAINT} /> },
        ]}
        selected={time}
        onSelect={setTime}
        style={{ marginTop: SPACE.block }}
      />

      <View style={{ paddingTop: SPACE.section, paddingBottom: SPACE.block, paddingHorizontal: 4, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text accessibilityRole="header" style={{ fontSize: TYPE.caption, fontWeight: "600", letterSpacing: 0.78, textTransform: "uppercase", color: MUTED }}>
          Steps for today
        </Text>
        <Text style={{ fontSize: TYPE.caption, color: MUTED }}>{time === "morning" ? "good morning" : "wind down"}</Text>
      </View>

      <View style={{ gap: SPACE.text }}>
        {steps.map((step, i) => (
          <StepCard key={`${time}-${step}`} number={i + 1} step={step} />
        ))}
      </View>
    </ScrollView>
  );
}

/**
 * One step (v9): its number, the step's name in small capitals, and — until
 * products can be picked per step — a way to scan one, with the step's bottle
 * faded on the right.
 */
function StepCard({ number, step }: { number: number; step: string }) {
  return (
    <View style={{ minHeight: 72, flexDirection: "row", alignItems: "center", gap: SPACE.block, borderRadius: CARD_RADIUS, backgroundColor: SURFACE, paddingVertical: SPACE.block, paddingHorizontal: SPACE.gutter }}>
      <Text style={{ width: 12, alignSelf: "flex-start", paddingTop: 1, fontSize: TYPE.caption, fontWeight: "600", lineHeight: 16, color: MUTED_FAINT }}>{number}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text accessibilityRole="header" style={{ fontSize: TYPE.caption, fontWeight: "600", letterSpacing: 0.78, textTransform: "uppercase", color: MUTED }}>
          {step}
        </Text>
        <Text style={{ fontSize: TYPE.body, lineHeight: 20, color: INK }}>No product picked yet.</Text>
        <Pressable
          onPress={() => openScanner()}
          accessibilityRole="button"
          accessibilityLabel={`Scan one to check, for ${step.toLowerCase()}`}
          // 28pt tall like the design; the slop takes the target to 44.
          hitSlop={8}
          style={{ alignSelf: "flex-start", minHeight: 28, flexDirection: "row", alignItems: "center", gap: SPACE.text }}
          className="active:opacity-70"
        >
          <CameraIcon />
          <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>Scan one to check</Text>
        </Pressable>
      </View>
      {STEP_BOTTLE[step] ? <Image source={STEP_BOTTLE[step]} contentFit="contain" accessibilityLabel="" style={{ width: 40, height: 46, opacity: 0.4 }} /> : null}
    </View>
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
