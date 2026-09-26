import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Animated, Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HEADER_GUTTER } from "@/components/AppHeader";
import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { Text } from "@/components/Text";
import { openScanner } from "@/lib/open-scanner";
import { homeGreetingWidth } from "@/lib/home-greeting";
import { tabBarClearance } from "@/lib/tab-bar";
import { CANVAS, CARD_SHADOW, INK, MUTED, SELECTED, SPACE } from "@/lib/tokens";

// The two cards' watercolors, on transparent ground: a hand holding a tube inside
// a scanner's frame, and two hands holding a serum and a pump bottle (their empty
// margins trimmed, and brought down to 500px from 1254px).
const SCAN_ART = require("@/assets/illustrations/home-scan.png");
const FIND_ART = require("@/assets/illustrations/home-find.png");
// The gap between the two cards.
const ACTION_CARD_GAP = 12;
// The least room the picture keeps. The cards are square, and grow taller rather
// than squeeze the picture below this when larger text needs the room.
const ACTION_ART_MIN_HEIGHT = 48;
// The watercolor still life under the cards: bottles, a vase and a handwritten
// "A little progress every day", on a transparent ground.
const STILL_LIFE_ART = require("@/assets/illustrations/home-still-life.png");
// Its own proportions, so it is never stretched.
const STILL_LIFE_ASPECT = 1004 / 1187;
// Where its handwriting starts, as a share of the picture's height. The picture
// is placed so the handwriting begins just under the scan card; the flowers above
// it run up behind the card, and the rest runs on past the bottom of the screen.
const STILL_LIFE_TEXT_TOP = 0.155;
// How much lower again it sits, in dp: 1.5 cm on a phone (160 dp to the inch).
// No spacing token is that large, so it is named here rather than typed inline.
const STILL_LIFE_DROP = 94;

// The handwritten "Hi, there!" on top of the screen, cut from design-watercolor/text.png.
const GREETING_ART = require("@/assets/illustrations/home-greeting.png");
const GREETING_ASPECT = 640 / 206;

/**
 * Home — the first screen after the intro.
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
  // A picture, so it is made to follow the text size here.
  const greetingWidth = homeGreetingWidth(fontScale);
  // Each card's width, which is also its least height: square at the ordinary
  // text sizes, taller when larger text needs it, never cut off.
  const cardSide = (width - HEADER_GUTTER * 2 - ACTION_CARD_GAP) / 2;
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
          {/* The greeting, in handwriting. */}
          <Image
            source={GREETING_ART}
            contentFit="contain"
            accessibilityLabel="Hi there!"
            style={{ width: greetingWidth, aspectRatio: GREETING_ASPECT }}
          />

          {/* The two ways in, side by side: scan a product in hand, or find one
              by name. "Find skincare" opens Browse, which has no tab of its own. */}
          <View style={{ flexDirection: "row", gap: ACTION_CARD_GAP }}>
            <ActionCard
              title="Scan a product"
              detail="Analyze a product by photo or barcode."
              art={SCAN_ART}
              side={cardSide}
              onPress={openScanner}
            />
            <ActionCard
              title="Find skincare"
              detail="Search products or brands."
              art={FIND_ART}
              side={cardSide}
              onPress={() => router.navigate("/browse")}
            />
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
 * One of Home's two cards, square at least (`side`): the picture on top, then
 * the title with its arrow and a line under it. The shade sits on an outer view: a view that clips its picture
 * (overflow hidden) loses its own shade on iOS.
 */
function ActionCard({
  title,
  detail,
  art,
  side,
  onPress,
}: {
  title: string;
  detail: string;
  art: number;
  side: number;
  onPress: () => void;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const press = (to: number) =>
    Animated.spring(scale, { toValue: to, friction: 6, tension: 220, useNativeDriver: Platform.OS !== "web" }).start();
  return (
    <Animated.View
      style={{
        flex: 1,
        minHeight: side,
        borderRadius: 22,
        backgroundColor: SELECTED,
        ...CARD_SHADOW,
        transform: [{ scale }],
      }}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => press(ACTION_CARD_PRESSED)}
        onPressOut={() => press(1)}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${detail}`}
        className="active:opacity-90"
        style={{ flexGrow: 1, borderRadius: 22, overflow: "hidden" }}
      >
        {/* The picture takes whatever the words leave, whole. */}
        <Image
          source={art}
          contentFit="contain"
          accessibilityLabel=""
          style={{ flex: 1, minHeight: ACTION_ART_MIN_HEIGHT, width: "100%", marginTop: 10 }}
        />
        <View style={{ gap: 2, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ flexShrink: 1, fontFamily: "PlayfairDisplay_500Medium", fontSize: 16, color: INK }}>{title}</Text>
            <ArrowIcon size={15} color={INK} strokeWidth={2.4} />
          </View>
          <Text style={{ fontSize: 11.5, lineHeight: 15, color: MUTED }}>{detail}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
