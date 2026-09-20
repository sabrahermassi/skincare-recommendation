import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Animated, Platform, Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HEADER_GUTTER } from "@/components/AppHeader";
import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { PressableCard } from "@/components/PressableCard";
import { Text } from "@/components/Text";
import { openScanner } from "@/lib/genie";
import { isPersonalized, pregnancyLabel, profileHeadline } from "@/lib/profile";
import { BORDER_INACTIVE, CANVAS, CARD_SHADOW, CHIP_SHADOW, INK, MUTED, SELECTED, SURFACE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// The watercolor from onboarding's second screen: a bottle and its ingredient list.
const SCAN_ART = require("@/assets/illustrations/scan-a-product.png");
// The watercolor scene under the cards (cropped to its art and brought down to
// 1400px wide from the 6144px original).
const SHELF_ART = require("@/assets/illustrations/home-shelf.png");
// Its own proportions (1400x940), so it is never stretched.
const SHELF_ASPECT = 1400 / 940;
// How wide it is drawn, as a multiple of the screen: a little past each side, so
// it runs off the edges and, with its bottom on the screen's bottom, the bottles
// stand just above the tab bar.
const SHELF_WIDTH = 1.15;
// The water's soft lower edge is drawn this far (a share of the picture's height)
// below the screen, so the water reaches the bottom with no gap.
const SHELF_BLEED_BELOW = 0.06;

/**
 * Home — the first screen after the skin quiz.
 *
 * A greeting, the skin profile the quiz produced as a card of chips (every score
 * on the other tabs is judged against it; it is edited under Profile), then the
 * scan card, which opens the full-screen scanner, and a shelf of watercolor
 * bottles filling the rest of the screen.
 */
/** How far the scan card sinks when pressed: it reads as a button though it is a card. */
const SCAN_CARD_PRESSED = 0.96;

export default function Home() {
  const [scale] = useState(() => new Animated.Value(1));
  const press = (to: number) =>
    Animated.spring(scale, { toValue: to, friction: 6, tension: 220, useNativeDriver: Platform.OS !== "web" }).start();
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
      {/* The scene fills the bottom of the screen, to its very bottom edge and a
          little past each side, behind everything else. The screen itself does not
          scroll: it is a fixed layout. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: -((width * SHELF_WIDTH) / SHELF_ASPECT) * SHELF_BLEED_BELOW,
          alignItems: "center",
        }}
      >
        <Image
          source={SHELF_ART}
          contentFit="contain"
          accessibilityLabel=""
          style={{ width: width * SHELF_WIDTH, aspectRatio: SHELF_ASPECT }}
        />
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: HEADER_GUTTER, paddingTop: 28, gap: 22 }}>
          <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 30, lineHeight: 36, color: INK }}>Hi, there!</Text>

          {/* The skin profile, each answer in its own chip. Only shown here: it is
              edited under Profile. */}
          {personalized ? (
            <View
              accessible
              accessibilityLabel={`Your skin profile: ${chips.join(", ")}`}
              style={{
                gap: 18,
                padding: 24,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: BORDER_INACTIVE,
                backgroundColor: SURFACE,
                ...CARD_SHADOW,
              }}
            >
              <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 20, color: INK }}>Your skin profile</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                {chips.map((chip) => (
                  <Chip key={chip} label={chip} />
                ))}
              </View>
            </View>
          ) : (
            // Nothing answered yet: the whole card leads to the skin profile, its
            // arrow at the far right, centred on the card.
            <PressableCard
              onPress={() => router.push("/skin-profile")}
              accessibilityLabel="Your skin profile is not set up yet. Open it to answer the skin questions."
              radius={22}
              backgroundColor={SURFACE}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 24, borderWidth: 1, borderColor: BORDER_INACTIVE }}
            >
              <View style={{ flex: 1, gap: 18 }}>
                <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 20, color: INK }}>Your skin profile</Text>
                <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>
                  Not set up yet. Answer the skin questions and every score will be made for your skin.
                </Text>
              </View>
              <ArrowIcon size={22} color={INK} />
            </PressableCard>
          )}

          {/* The scan card. The shade sits on an outer view: a view that clips
              its picture (overflow hidden) loses its own shade on iOS. */}
          <Animated.View style={{ minHeight: 150, borderRadius: 22, backgroundColor: SELECTED, ...CARD_SHADOW, transform: [{ scale }] }}>
          <Pressable
            onPress={openScanner}
            onPressIn={() => press(SCAN_CARD_PRESSED)}
            onPressOut={() => press(1)}
            accessibilityRole="button"
            accessibilityLabel="Scan a product. Analyze a product by photo or barcode."
            className="active:opacity-90"
            style={{
              flexGrow: 1,
              borderRadius: 22,
              padding: 20,
              overflow: "hidden",
              justifyContent: "center",
            }}
          >
            <View style={{ maxWidth: "60%", gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 22, color: INK }}>Scan a product</Text>
                <ArrowIcon size={18} color={INK} />
              </View>
              {/* Narrower than the title above it, so it stops short of the picture. */}
              <Text style={{ maxWidth: 150, fontSize: 13, lineHeight: 19, color: MUTED }}>Analyze a product by photo or barcode.</Text>
            </View>
            <Image
              source={SCAN_ART}
              contentFit="contain"
              accessibilityLabel=""
              // Whole and centred on the card's right side, top to bottom: nothing cropped.
              style={{ position: "absolute", right: 6, top: 6, bottom: 6, width: 150 }}
            />
          </Pressable>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

/**
 * One answer of the skin profile, in the same peach and terracotta as a selected
 * chip, softened: a filled pill with no outline and room around the word, like
 * the skin-type tag in the reference profile. All the same height and width, two
 * to a row, so the card reads as a grid; an odd one out stretches across its row.
 */
function Chip({ label }: { label: string }) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: "42%",
        height: 46,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
        borderRadius: 23,
        backgroundColor: SELECTED,
        ...CHIP_SHADOW,
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: "500",
          letterSpacing: 0.2,
          color: INK,
          textAlign: "center",
          textAlignVertical: "center",
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
