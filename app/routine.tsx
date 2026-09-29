import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { RowChevron } from "@/components/MenuRows";
import { PageTitle } from "@/components/PageTitle";
import { BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SegmentedSwitch, type SwitchLook } from "@/components/SegmentedSwitch";
import { Text } from "@/components/Text";
import { openQuiz } from "@/lib/open-quiz";
import { openScanner } from "@/lib/open-scanner";
import { isPersonalized, profileHeadline } from "@/lib/profile";
import { CANVAS, CARD_RADIUS, INK, LINK, MUTED, ROUTINE_TIME, SPACE, SURFACE, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// A woman at her dressing table wondering about her products
// (new-watercolor/no_product_match_v2_transparent.png, trimmed and brought down
// to 1000px wide).
const ROUTINE_ART = require("@/assets/illustrations/routine-coming-soon.webp");
const ROUTINE_ASPECT = 1000 / 611;

type TimeOfDay = "morning" | "evening";

// The steps of each routine, in order (owner's reference), and the faded
// bottle each step's card shows until a product is picked for it (v7).
const STEPS: Record<TimeOfDay, string[]> = {
  morning: ["Cleansing", "Toning", "Moisturizing", "Sun protection"],
  evening: ["Cleansing", "Toning", "Serum", "Moisturizing"],
};
const STEP_BOTTLE: Record<string, number> = {
  Cleansing: require("@/assets/illustrations/bottle-cleanser.png"),
  Toning: require("@/assets/illustrations/bottle-toner.png"),
  Serum: require("@/assets/illustrations/bottle-serum.png"),
  Moisturizing: require("@/assets/illustrations/bottle-moisturizer.png"),
  "Sun protection": require("@/assets/illustrations/bottle-sunscreen.png"),
};

/**
 * Skincare routine — opened from its card on Home. With no skin profile yet it
 * asks for one ("Take the skin quiz" opens the quiz, which closes back here);
 * with one, it lays out the morning and evening steps (v7). The products for
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
      <View style={{ flex: 1, justifyContent: "center", paddingTop: SPACE.section }}>
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
  const tint = ROUTINE_TIME[time];
  const look: SwitchLook = {
    track: tint.track,
    thumb: tint.thumb,
    label: MUTED,
    chosenLabel: tint.ink,
    thumbShadow: { shadowColor: tint.thumbShadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2 },
    fontSize: TYPE.label,
  };
  const steps = STEPS[time];
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.text, paddingBottom: insets.bottom + SPACE.section }}>
      <PageTitle title="Your skincare routine" />

      {/* What the routine is built from; tapping it changes the answers. */}
      <Pressable
        onPress={() => router.push("/skin-profile")}
        accessibilityRole="button"
        className="active:opacity-70"
        style={{ marginTop: SPACE.gutter, flexDirection: "row", alignItems: "center", gap: SPACE.block, borderRadius: CARD_RADIUS, backgroundColor: SURFACE, paddingVertical: SPACE.block, paddingHorizontal: SPACE.gutter }}
      >
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>Your skin profile</Text>
          <Text numberOfLines={1} style={{ fontSize: TYPE.caption, color: MUTED }}>
            {[title, ...tags].join(" · ")}
          </Text>
        </View>
        <RowChevron />
      </Pressable>

      <SegmentedSwitch
        tone={look}
        options={[
          { value: "morning", label: "Morning", icon: (on) => <Ionicons name={on ? "sunny" : "sunny-outline"} size={17} color={on ? ROUTINE_TIME.morning.icon : ROUTINE_TIME.idleIcon} /> },
          { value: "evening", label: "Evening", icon: (on) => <Ionicons name={on ? "moon" : "moon-outline"} size={16} color={on ? ROUTINE_TIME.evening.icon : ROUTINE_TIME.idleIcon} /> },
        ]}
        selected={time}
        onSelect={setTime}
        style={{ marginTop: SPACE.block }}
      />

      <View style={{ paddingTop: SPACE.section, paddingBottom: SPACE.block, paddingHorizontal: 4, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text accessibilityRole="header" style={{ fontSize: TYPE.caption, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: MUTED }}>
          Steps for today
        </Text>
        <Text style={{ fontSize: TYPE.caption, color: MUTED }}>{time === "morning" ? "good morning" : "wind down"}</Text>
      </View>

      {steps.map((step, i) => (
        <View key={`${time}-${step}`}>
          <StepCard number={i + 1} step={step} time={time} />
          {i < steps.length - 1 ? <Connector colour={tint.dot} /> : null}
        </View>
      ))}
    </ScrollView>
  );
}

/**
 * One step (v7): its number in the time's colours, the step's name in small
 * capitals, and — until products can be picked per step — a way to scan one,
 * with the step's bottle faded on the right.
 */
function StepCard({ number, step, time }: { number: number; step: string; time: TimeOfDay }) {
  const tint = ROUTINE_TIME[time];
  return (
    <View style={{ minHeight: 72, flexDirection: "row", alignItems: "center", gap: SPACE.block, borderRadius: 24, backgroundColor: SURFACE, paddingVertical: SPACE.block, paddingHorizontal: SPACE.gutter }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: tint.thumb }}>
        <Text style={{ fontSize: TYPE.card, fontWeight: "600", color: tint.ink }}>{number}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text accessibilityRole="header" style={{ fontSize: TYPE.caption, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: MUTED }}>
          {step}
        </Text>
        <Text style={{ fontSize: TYPE.body, lineHeight: 20, color: INK }}>No product picked yet.</Text>
        <Pressable
          onPress={openScanner}
          accessibilityRole="button"
          accessibilityLabel={`Scan one to check, for ${step.toLowerCase()}`}
          // 28pt tall like the design; the slop takes the target to 44.
          hitSlop={8}
          style={{ alignSelf: "flex-start", minHeight: 28, flexDirection: "row", alignItems: "center", gap: SPACE.text }}
          className="active:opacity-70"
        >
          <Ionicons name="scan-outline" size={16} color={LINK} />
          <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>Scan one to check</Text>
        </Pressable>
      </View>
      {STEP_BOTTLE[step] ? <Image source={STEP_BOTTLE[step]} contentFit="contain" accessibilityLabel="" style={{ width: 40, height: 46, opacity: 0.4 }} /> : null}
    </View>
  );
}

/** Three fading dots between two steps (v7), under the number badges. */
function Connector({ colour }: { colour: string }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 14, justifyContent: "center", gap: 3, paddingLeft: 32 }}>
      {[1, 0.7, 0.45].map((opacity) => (
        <View key={opacity} style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: colour, opacity }} />
      ))}
    </View>
  );
}
