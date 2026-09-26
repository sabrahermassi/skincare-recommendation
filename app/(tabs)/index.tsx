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
import { BORDER_INACTIVE, CANVAS, CARD_SHADOW, CHIP_SHADOW, INK, MUTED, SELECTED, SPACE, SURFACE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// The watercolor from onboarding's second screen: a bottle and its ingredient list.
const SCAN_ART = require("@/assets/illustrations/scan-a-product.png");
// "Find skincare": the tube under a magnifier, from onboarding's ingredients
// screen, standing in until the card has art of its own.
const FIND_ART = require("@/assets/illustrations/onboarding/hero-ingredients.png");
// The picture at the top of each of the two cards.
const ACTION_ART_HEIGHT = 96;
// The watercolor still life under the cards: bottles, a vase and a handwritten
// "A little progress every day", on a transparent ground.
const STILL_LIFE_ART = require("@/assets/illustrations/home-still-life.png");
// Its own proportions, so it is never stretched.
const STILL_LIFE_ASPECT = 1004 / 1187;
// Where its handwriting starts, as a share of the picture's height. The picture
// is placed so the handwriting begins just under the scan card; the flowers above
// it run up behind the card, and the rest runs on past the bottom of the screen.
const STILL_LIFE_TEXT_TOP = 0.155;

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
 * two cards side by side — "Scan a product", which opens the full-screen
 * scanner, and "Find skincare", which opens Browse — and a watercolor still
 * life under them, running on past the bottom edge of the screen. The layout is
 * fixed while it fits; on a short screen or with large text it scrolls, so both
 * cards are always reachable.
 */
/** How far a card sinks when pressed: it reads as a button though it is a card. */
const ACTION_CARD_PRESSED = 0.96;

export default function Home() {
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

          {/* The two ways in, side by side: scan a product in hand, or find one
              by name. "Find skincare" opens Browse, which has no tab of its own. */}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <ActionCard
              title="Scan a product"
              detail="Analyze a product by photo or barcode."
              art={SCAN_ART}
              onPress={openScanner}
            />
            <ActionCard
              title="Find skincare"
              detail="Search products or brands."
              art={FIND_ART}
              onPress={() => router.navigate("/browse")}
            />
          </View>

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

        {/* The still life: full width, its handwriting just under the scan card,
            its foot running on behind the tab bar and past the bottom of the
            screen. Drawn behind the cards (zIndex) and out of the layout, so it
            never adds scrolling. Its handwriting is read out. */}
        <View
          pointerEvents="none"
          accessible
          accessibilityLabel="A little progress every day"
          style={{ flexGrow: 1, zIndex: -1 }}
        >
          <Image
            source={STILL_LIFE_ART}
            contentFit="contain"
            accessibilityLabel=""
            style={{
              position: "absolute",
              left: 0,
              top: SPACE.text - (width / STILL_LIFE_ASPECT) * STILL_LIFE_TEXT_TOP,
              width,
              aspectRatio: STILL_LIFE_ASPECT,
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * One of Home's two cards: a picture on top, the title with its arrow, and a
 * line under it. The shade sits on an outer view: a view that clips its picture
 * (overflow hidden) loses its own shade on iOS.
 */
function ActionCard({ title, detail, art, onPress }: { title: string; detail: string; art: number; onPress: () => void }) {
  const [scale] = useState(() => new Animated.Value(1));
  const press = (to: number) =>
    Animated.spring(scale, { toValue: to, friction: 6, tension: 220, useNativeDriver: Platform.OS !== "web" }).start();
  return (
    <Animated.View style={{ flex: 1, borderRadius: 22, backgroundColor: SELECTED, ...CARD_SHADOW, transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => press(ACTION_CARD_PRESSED)}
        onPressOut={() => press(1)}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${detail}`}
        className="active:opacity-90"
        style={{ flexGrow: 1, borderRadius: 22, padding: 16, gap: 10, overflow: "hidden" }}
      >
        <Image source={art} contentFit="contain" accessibilityLabel="" style={{ width: "100%", height: ACTION_ART_HEIGHT }} />
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ flexShrink: 1, fontFamily: "PlayfairDisplay_500Medium", fontSize: 19, color: INK }}>{title}</Text>
            <ArrowIcon size={18} color={INK} strokeWidth={2.4} />
          </View>
          <Text style={{ fontSize: 13, lineHeight: 18, color: MUTED }}>{detail}</Text>
        </View>
      </Pressable>
    </Animated.View>
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
