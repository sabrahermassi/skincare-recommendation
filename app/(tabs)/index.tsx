import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { AppHeader, HEADER_GUTTER } from "@/components/AppHeader";
import { TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import { openScanner } from "@/lib/genie";
import { isPersonalized, pregnancyLabel, profileHeadline } from "@/lib/profile";
import { CANVAS, INK, MUTED, MUTED_FAINT, SELECTED, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// The watercolor from onboarding's first screen: someone photographing a bottle.
const SCAN_ART = require("@/assets/illustrations/onboarding/onb2-scan.png");
// The shelf that fills the empty Saved and History screens.
const SHELF_ART = require("@/assets/illustrations/saved-empty-shelf.png");

/**
 * Home — the first screen after the skin quiz.
 *
 * The skin profile the quiz produced sits on top, each answer as its own chip,
 * because every score on the other tabs is judged against it. Under it the scan
 * card, which opens the full-screen scanner, and a shelf of watercolor bottles
 * filling the rest of the screen.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const personalized = isPersonalized(profile);

  const { title, tags } = profileHeadline(profile);
  const chips = [
    ...(profile.baseSkinType ? [title] : []),
    ...tags,
    // Only when it changes what is shown as safe; "neither" and "prefer not to say" add nothing.
    ...(profile.pregnancyStatus === "pregnant" || profile.pregnancyStatus === "breastfeeding"
      ? [pregnancyLabel(profile.pregnancyStatus)]
      : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 96 }} showsVerticalScrollIndicator={false}>
        <AppHeader />

        <View style={{ paddingHorizontal: HEADER_GUTTER, gap: 22 }}>
          {/* The skin profile, each answer in its own chip; tapping any of it edits it. */}
          <Pressable
            onPress={() => router.push("/skin-profile")}
            accessibilityRole="button"
            accessibilityLabel={personalized ? `Your skin profile: ${chips.join(", ")}. Tap to edit.` : "Set up your skin profile"}
            className="active:opacity-80"
            style={{ gap: 12 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: TYPE.caption, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1.2, color: MUTED_FAINT }}>
                Your skin profile
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: INK }}>{personalized ? "Edit" : "Set up"}</Text>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {personalized ? (
                chips.map((chip) => <Chip key={chip} label={chip} />)
              ) : (
                <Chip label="Set up your skin profile" />
              )}
            </View>
          </Pressable>

          {/* The scan card. */}
          <Pressable
            onPress={openScanner}
            accessibilityRole="button"
            accessibilityLabel="Scan a product. Analyze a product by photo or barcode."
            className="active:opacity-90"
            style={{
              minHeight: 150,
              borderRadius: 22,
              backgroundColor: SELECTED,
              padding: 20,
              overflow: "hidden",
              justifyContent: "center",
            }}
          >
            <View style={{ maxWidth: "60%", gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: INK }}>Scan a product</Text>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path d="M5 12h14M13 6l6 6-6 6" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
              <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>Analyze a product by photo or barcode.</Text>
            </View>
            <Image
              source={SCAN_ART}
              contentFit="contain"
              accessibilityLabel=""
              style={{ position: "absolute", right: -18, bottom: -6, width: 170, height: 170 }}
            />
          </Pressable>
        </View>

        {/* The shelf, in whatever room is left. */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", paddingTop: 24 }}>
          <Image source={SHELF_ART} contentFit="contain" accessibilityLabel="" style={{ width: 286, height: 182 }} />
        </View>
      </ScrollView>
    </View>
  );
}

/** One answer of the skin profile, in the same peach and terracotta as a selected chip. */
function Chip({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 16,
        height: 40,
        justifyContent: "center",
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: TERRACOTTA,
        backgroundColor: SELECTED,
      }}
    >
      <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK }}>{label}</Text>
    </View>
  );
}
