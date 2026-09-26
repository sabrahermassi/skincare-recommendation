import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Animated, Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HEADER_GUTTER } from "@/components/AppHeader";
import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { PressableCard } from "@/components/PressableCard";
import { Text } from "@/components/Text";
import { openScanner } from "@/lib/open-scanner";
import { homeGreetingLayout, SIGNATURE_WIDTH } from "@/lib/home-greeting";
import { answeredWithoutSignal, isPersonalized, pregnancyLabel, profileHeadline } from "@/lib/profile";
import { tabBarClearance } from "@/lib/tab-bar";
import { BORDER_INACTIVE, CANVAS, CARD_SHADOW, CHIP_SHADOW, INK, MUTED, SELECTED, SURFACE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// The watercolor from onboarding's second screen: a bottle and its ingredient list.
const SCAN_ART = require("@/assets/illustrations/scan-a-product.png");
// The watercolor scene under the cards (brought down to 1500px wide from the
// 6144px original, its top edge faded into the screen and its water carried on
// below the bottles so the tab bar sits on water rather than on the bottles).
const SHELF_ART = require("@/assets/illustrations/home-shelf.webp");
// Its own proportions (1500x1200), so it is never stretched.
const SHELF_ASPECT = 1500 / 1200;
// How wide it is drawn, as a multiple of the screen: a little past each side, so
// it runs off the edges and, with its bottom on the screen's bottom, the bottles
// stand just above the tab bar.
const SHELF_WIDTH = 1.15;
// A sliver of the water is drawn this far (a share of the picture's height)
// below the screen, so the water reaches the bottom with no gap.
const SHELF_BLEED_BELOW = 0.02;
// How far the whole scene sits lower again, in dp: 6.5 mm on a phone (160 dp to the inch).
// No spacing token is that large, so it is named here rather than typed inline.
const SHELF_DROP = 41;

// The handwriting on top of the screen, cut from design-watercolor/text.png. The
// signature is recoloured to the app's terracotta (the same colour as the camera
// button); the heart is design-watercolor/heart.png.
const GREETING_ART = require("@/assets/illustrations/home-greeting.png");
const GREETING_ASPECT = 640 / 206;
const SIGNATURE_ART = require("@/assets/illustrations/home-signature.png");
const SIGNATURE_ASPECT = 520 / 449;
const HEART_ART = require("@/assets/illustrations/home-heart.png");
const HEART_ASPECT = 240 / 214;
const HEART_WIDTH = 24;
// Where the heart sits inside the signature at its full width (SIGNATURE_WIDTH): under
// "happier", right of "you". Scaled with the signature when that is drawn smaller.
const HEART_LEFT = 96;
const HEART_TOP = 64;
// The signature's distance from the top of the content column, and from the screen's
// right edge (4 closer than the text gutter, so its right-hand flourish sits near the edge).
const SIGNATURE_TOP = 14;
const SIGNATURE_RIGHT = HEADER_GUTTER - 4;

/**
 * Home — the first screen after the skin quiz.
 *
 * A greeting, the skin profile the quiz produced as a card of chips (every score
 * on the other tabs is judged against it; it is edited under Profile), then the
 * scan card, which opens the full-screen scanner, and a shelf of watercolor
 * bottles filling the rest of the screen. The layout is fixed while it fits; on a
 * short screen or with large text it scrolls, so the scan card is always reachable.
 */
/** How far the scan card sinks when pressed: it reads as a button though it is a card. */
const SCAN_CARD_PRESSED = 0.96;

export default function Home() {
  const [scale] = useState(() => new Animated.Value(1));
  const press = (to: number) =>
    Animated.spring(scale, { toValue: to, friction: 6, tension: 220, useNativeDriver: Platform.OS !== "web" }).start();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  // Both are pictures: the greeting follows the text size, and the signature takes only
  // the room the greeting leaves (or is left out), so the two never overpaint.
  const { greetingWidth, signatureWidth } = homeGreetingLayout({
    screenWidth: width,
    fontScale,
    gutter: HEADER_GUTTER,
    signatureRight: SIGNATURE_RIGHT,
  });
  const signatureScale = signatureWidth === null ? 0 : signatureWidth / SIGNATURE_WIDTH;
  const profile = useAppStore((s) => s.profile);
  const personalized = isPersonalized(profile);
  // Answered the quiz, but nothing in it can drive a score (#291): the card
  // must not tell them to answer the questions they just answered.
  const answered = answeredWithoutSignal(profile);

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
          little past each side, behind everything else. It stays where it is when
          the content above scrolls. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: -((width * SHELF_WIDTH) / SHELF_ASPECT) * SHELF_BLEED_BELOW - SHELF_DROP,
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

      {/* Scrolls only when the content is taller than the screen: flexGrow keeps a
          short page filling it, and the bounce and stretch that would make a page
          that fits look loose are switched off. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: tabBarClearance(insets.bottom) }}
        alwaysBounceVertical={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: HEADER_GUTTER, paddingTop: 28, gap: 22 }}>
          {/* The greeting, in handwriting. The signature is not here: it floats above
              the screen (below), so it takes no room from the cards. */}
          <Image
            source={GREETING_ART}
            contentFit="contain"
            accessibilityLabel="Hi there!"
            style={{ width: greetingWidth, aspectRatio: GREETING_ASPECT }}
          />

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
              accessibilityLabel={
                answered
                  ? "Your scores aren't personal yet. Open your skin profile to add your skin type or a concern."
                  : "Your skin profile is not set up yet. Open it to answer the skin questions."
              }
              radius={22}
              backgroundColor={SURFACE}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 24, borderWidth: 1, borderColor: BORDER_INACTIVE }}
            >
              <View style={{ flex: 1, gap: 18 }}>
                <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 20, color: INK }}>Your skin profile</Text>
                <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>
                  {answered
                    ? "Scores aren't personal yet. Add your skin type or a concern when you know it, and every score will be made for your skin."
                    : "Not set up yet. Answer the skin questions and every score will be made for your skin."}
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
                <ArrowIcon size={22} color={INK} strokeWidth={2.4} />
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

          {/* The signature: a floating layer, not part of the column, so it takes no
              space and can cross the top edge of the skin profile card. Last in the
              column so it is drawn on top, and inside the scroll so it moves with
              the cards; it ignores touches so the card under it stays tappable. */}
          {/* The label is there whether or not the picture is: when there is no room
              for the artwork (large text on a narrow phone) a screen reader still
              gets the tagline, from an empty one-point view. */}
          <View
            pointerEvents="none"
            accessible
            accessibilityLabel="Skincare for a happier you"
            style={
              signatureWidth !== null
                ? {
                    position: "absolute",
                    top: SIGNATURE_TOP,
                    right: SIGNATURE_RIGHT,
                    width: signatureWidth,
                    zIndex: 10,
                    elevation: 10,
                  }
                : { position: "absolute", top: SIGNATURE_TOP, right: SIGNATURE_RIGHT, width: 1, height: 1 }
            }
          >
            {signatureWidth !== null ? (
              <>
                <Image
                  source={SIGNATURE_ART}
                  contentFit="contain"
                  accessibilityLabel=""
                  style={{ width: signatureWidth, aspectRatio: SIGNATURE_ASPECT }}
                />
                <Image
                  source={HEART_ART}
                  contentFit="contain"
                  accessibilityLabel=""
                  style={{
                    position: "absolute",
                    left: HEART_LEFT * signatureScale,
                    top: HEART_TOP * signatureScale,
                    width: HEART_WIDTH * signatureScale,
                    aspectRatio: HEART_ASPECT,
                  }}
                />
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** Past this text scale a profile chip takes its own row (#314). */
const FULL_WIDTH_CHIP_SCALE = 1.2;

/**
 * One answer of the skin profile, in the same peach and terracotta as a selected
 * chip, softened: a filled pill with no outline and room around the word, like
 * the skin-type tag in the reference profile. All the same height and width, two
 * to a row, so the card reads as a grid; an odd one out stretches across its row.
 * At the larger text sizes (#314) a half-width chip can't hold "Combination"
 * on one line, so each takes a whole row, and the height is a minimum so a
 * label that still wraps grows its chip instead of being cut off.
 */
function Chip({ label }: { label: string }) {
  const { fontScale } = useWindowDimensions();
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: fontScale > FULL_WIDTH_CHIP_SCALE ? "100%" : "42%",
        minHeight: 46,
        paddingVertical: 8,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 14,
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
