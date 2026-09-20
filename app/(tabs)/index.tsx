import { Image } from "expo-image";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { AppHeader, HEADER_GUTTER } from "@/components/AppHeader";
import { TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import { openScanner } from "@/lib/genie";
import { isPersonalized, pregnancyLabel, profileHeadline } from "@/lib/profile";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, SELECTED, SURFACE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// The watercolor from onboarding's second screen: a bottle and its ingredient list.
const SCAN_ART = require("@/assets/illustrations/onboarding/onb2-ingredients.png");
// The shelf that fills the empty Saved and History screens.
const SHELF_ART = require("@/assets/illustrations/saved-empty-shelf.png");
// Its own proportions (1400x892, cropped to the art), so it is never stretched.
const SHELF_ASPECT = 1400 / 892;

/**
 * Home — the first screen after the skin quiz.
 *
 * A greeting, the skin profile the quiz produced as a card of chips (every score
 * on the other tabs is judged against it; it is edited under Profile), then the
 * scan card, which opens the full-screen scanner, and a shelf of watercolor
 * bottles filling the rest of the screen.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <AppHeader />

        <View style={{ paddingHorizontal: HEADER_GUTTER, gap: 22 }}>
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 30, lineHeight: 36, color: INK }}>Hi there</Text>

          {/* The skin profile, each answer in its own chip. Only shown here: it is
              edited under Profile. */}
          <View
            accessible
            accessibilityLabel={personalized ? `Your skin profile: ${chips.join(", ")}` : "Your skin profile is not set up yet"}
            style={{
              gap: 14,
              padding: 20,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: BORDER_INACTIVE,
              backgroundColor: SURFACE,
            }}
          >
            <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 20, color: INK }}>Your skin profile</Text>

            {personalized ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {chips.map((chip) => (
                  <Chip key={chip} label={chip} />
                ))}
              </View>
            ) : (
              <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>
                Not set up yet. Answer the skin questions under Profile and every score will be made for your skin.
              </Text>
            )}
          </View>

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

        {/* The shelf, across the whole width and a little past it, resting on the
            tab bar — it fills what is left of the screen rather than sitting in it. */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", paddingTop: 16, overflow: "hidden" }}>
          <Image
            source={SHELF_ART}
            contentFit="contain"
            accessibilityLabel=""
            style={{ width: width * 1.3, aspectRatio: SHELF_ASPECT }}
          />
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
