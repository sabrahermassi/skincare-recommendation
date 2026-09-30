import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HEADER_GUTTER } from "@/components/AppHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { Text } from "@/components/Text";
import { openQuiz } from "@/lib/open-quiz";
import { isPersonalized, profileHeadline } from "@/lib/profile";
import { CANVAS, CARD_SHADOW, DISPLAY_FONT, GRAY_FILL, INK, MENU_FILL, MUTED, SPACE, SURFACE, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// A woman at her dressing table wondering about her products
// (new-watercolor/no_product_match_v2_transparent.png, trimmed and brought down
// to 1000px wide).
const ROUTINE_ART = require("@/assets/illustrations/routine-coming-soon.webp");
const ROUTINE_ASPECT = 1000 / 611;

type TimeOfDay = "morning" | "evening";

// The steps of each routine, in order (owner's reference).
const STEPS: Record<TimeOfDay, string[]> = {
  morning: ["Cleansing", "Toning", "Moisturizing", "Sun protection"],
  evening: ["Cleansing", "Toning", "Serum", "Moisturizing"],
};

/**
 * Skincare routine — opened from its card on Home. With no skin profile yet it
 * asks for one ("Complete it now" opens the skin quiz, which closes back here);
 * with one, it lays out the morning and evening steps. The products for each
 * step aren't built yet, so every step holds an empty card for now.
 */
export default function Routine() {
  const profile = useAppStore((s) => s.profile);
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader title="Your skincare routine" />
      {isPersonalized(profile) ? <Steps /> : <EmptyProfile />}
    </View>
  );
}

function EmptyProfile() {
  const insets = useSafeAreaInsets();
  return (
    <>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", gap: SPACE.text, paddingHorizontal: HEADER_GUTTER, paddingVertical: SPACE.gutter }}
      >
        <Image source={ROUTINE_ART} contentFit="contain" accessibilityLabel="" style={{ width: "100%", aspectRatio: ROUTINE_ASPECT }} />
        <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, color: INK }}>
          Your skin profile is empty
        </Text>
        <Text style={{ textAlign: "center", fontSize: TYPE.body, lineHeight: TYPE.body * 1.4, color: MUTED }}>
          Fill it in to create a skincare routine made just for you.
        </Text>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: Math.max(SPACE.block, insets.bottom) }}>
        <PrimaryButton label="Complete it now" onPress={openQuiz} />
      </View>
    </>
  );
}

function Steps() {
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const [time, setTime] = useState<TimeOfDay>("morning");
  const { title, tags } = profileHeadline(profile);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: SPACE.block, paddingBottom: insets.bottom + SPACE.gutter }}>
      <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, color: INK }}>
        Steps for today
      </Text>

      {/* What the routine is built from; tapping it changes the answers. */}
      <Pressable
        onPress={() => router.push("/skin-profile")}
        accessibilityRole="button"
        className="active:opacity-80"
        style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, backgroundColor: MENU_FILL, padding: 16 }}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>Your skin profile</Text>
          <Text numberOfLines={2} style={{ fontSize: TYPE.label, color: MUTED }}>
            {[title, ...tags].join(" · ")}
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={20} color={INK} />
      </Pressable>

      <SegmentedSwitch
        tone="light"
        options={[
          { value: "morning", label: "Morning" },
          { value: "evening", label: "Evening" },
        ]}
        selected={time}
        onSelect={setTime}
      />

      {STEPS[time].map((step, i) => (
        <View key={`${time}-${step}`} style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: MENU_FILL }}>
              <Text style={{ fontSize: TYPE.label, fontWeight: "700", color: INK }}>{i + 1}</Text>
            </View>
            <Text accessibilityRole="header" style={{ fontSize: TYPE.title, fontWeight: "600", color: INK }}>
              {step}
            </Text>
          </View>
          <EmptyStepCard />
        </View>
      ))}

      <Text style={{ textAlign: "center", fontSize: TYPE.label, color: MUTED }}>Product picks for each step are coming soon.</Text>
    </ScrollView>
  );
}

/** Where a step's product will go: a quiet placeholder until picks are built. */
function EmptyStepCard() {
  return (
    <View
      accessible
      accessibilityLabel="No product yet"
      style={{ flexDirection: "row", alignItems: "center", gap: 16, borderRadius: 24, backgroundColor: SURFACE, padding: 18, ...CARD_SHADOW }}
    >
      <View style={{ width: 56, height: 72, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="flask-outline" size={40} color={GRAY_FILL} />
      </View>
      <View style={{ flex: 1, gap: 10 }}>
        <View style={{ height: 14, width: "55%", borderRadius: 7, backgroundColor: GRAY_FILL }} />
        <View style={{ height: 14, width: "85%", borderRadius: 7, backgroundColor: GRAY_FILL }} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ height: 24, width: 64, borderRadius: 12, backgroundColor: GRAY_FILL }} />
          <View style={{ height: 24, width: 96, borderRadius: 12, backgroundColor: GRAY_FILL }} />
        </View>
      </View>
    </View>
  );
}
