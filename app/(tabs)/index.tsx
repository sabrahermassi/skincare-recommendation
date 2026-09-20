import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { AppHeader, HEADER_GUTTER } from "@/components/AppHeader";
import { Text } from "@/components/Text";
import { openScanner } from "@/lib/genie";
import { isPersonalized, profileSummary } from "@/lib/profile";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, MUTED_FAINT, SELECTED, SURFACE, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// The watercolor from onboarding's first screen: someone photographing a bottle.
const SCAN_ART = require("@/assets/illustrations/onboarding/onb2-scan.png");

/**
 * Home — the first screen after the skin quiz, and the one the app opens on.
 *
 * Three things, in the order they matter: scan a product (the card opens the
 * full-screen scanner), search for one, and the skin profile the quiz produced,
 * which is what every score on the other tabs is judged against.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const personalized = isPersonalized(profile);

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <AppHeader />

        <View style={{ paddingHorizontal: HEADER_GUTTER, gap: 18 }}>
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 30, lineHeight: 36, color: INK }}>
            Hi there
          </Text>

          {/* Looks like the search box on the Search tab; tapping it goes there. */}
          <Pressable
            onPress={() => router.navigate("/browse")}
            accessibilityRole="search"
            accessibilityLabel="Search products or brands"
            style={{
              height: 48,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: BORDER_INACTIVE,
              backgroundColor: CANVAS,
              paddingHorizontal: 18,
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 13.5, color: MUTED_FAINT }}>Search products or brands</Text>
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

          {/* The skin profile the quiz produced. */}
          <Pressable
            onPress={() => router.navigate("/profile")}
            accessibilityRole="button"
            accessibilityLabel={personalized ? "Your skin profile. Tap to edit." : "Set up your skin profile"}
            className="active:opacity-90"
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: BORDER_INACTIVE,
              backgroundColor: SURFACE,
              padding: 20,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: TYPE.caption, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1.2, color: MUTED_FAINT }}>
                Your skin profile
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: INK }}>{personalized ? "Edit" : "Set up"}</Text>
            </View>
            <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 20, lineHeight: 26, color: INK }}>
              {personalized ? profileSummary(profile) : "Not set up yet"}
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>
              {personalized
                ? "Every score is worked out against this."
                : "Answer a few questions and every score will be made for your skin."}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
