import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Animated, Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HEADER_GUTTER } from "@/components/AppHeader";
import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { Text } from "@/components/Text";
import { openScanner } from "@/lib/open-scanner";
import { homeGreetingLayout, SIGNATURE_WIDTH } from "@/lib/home-greeting";
import { tabBarClearance } from "@/lib/tab-bar";
import { CANVAS, CARD_SHADOW, INK, MUTED, SELECTED, SPACE } from "@/lib/tokens";

// The two cards' watercolors: a hand holding a tube inside a scanner's frame, and
// two hands holding a serum and a pump bottle. Square, on cream paper, drawn edge
// to edge across the top of their cards (brought down to 600px from 1254px).
const SCAN_ART = require("@/assets/illustrations/home-scan.png");
const FIND_ART = require("@/assets/illustrations/home-find.png");
// The picture's shape on the card: a little wider than tall, so the square art
// loses a sliver top and bottom and the card stays short enough for the still life.
const ACTION_ART_ASPECT = 1.15;
// The watercolor still life under the cards: bottles, a vase and a handwritten
// "A little progress every day", on a transparent ground.
const STILL_LIFE_ART = require("@/assets/illustrations/home-still-life.png");
// Its own proportions, so it is never stretched.
const STILL_LIFE_ASPECT = 1004 / 1187;
// Where its handwriting starts, as a share of the picture's height. The picture
// is placed so the handwriting begins just under the scan card; the flowers above
// it run up behind the card, and the rest runs on past the bottom of the screen.
const STILL_LIFE_TEXT_TOP = 0.155;
// How much lower again it sits, in dp: 1 cm on a phone (160 dp to the inch).
// No spacing token is that large, so it is named here rather than typed inline.
const STILL_LIFE_DROP = 63;

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
 * A greeting, then two cards side by side — "Scan a product", which opens the
 * full-screen scanner, and "Find skincare", which opens Browse — and a
 * watercolor still life under them, running on past the bottom edge of the screen. The layout is
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
              space and can cross the top edge of the cards. Last in the
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

        {/* The still life: full width, its handwriting a little under the cards,
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
              top: SPACE.text + STILL_LIFE_DROP - (width / STILL_LIFE_ASPECT) * STILL_LIFE_TEXT_TOP,
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
 * One of Home's two cards: a picture across the top, the title with its arrow,
 * and a line under it. The shade sits on an outer view: a view that clips its picture
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
        style={{ flexGrow: 1, borderRadius: 22, overflow: "hidden" }}
      >
        {/* Edge to edge: the card's rounded corners clip the picture's top corners. */}
        <Image source={art} contentFit="cover" accessibilityLabel="" style={{ width: "100%", aspectRatio: ACTION_ART_ASPECT }} />
        <View style={{ gap: 4, padding: 16, paddingTop: 12 }}>
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
