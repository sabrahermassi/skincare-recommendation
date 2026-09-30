import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import { openScanner } from "@/lib/open-scanner";
import { tabBarClearance } from "@/lib/tab-bar";
import { CANVAS, CARD_RADIUS, DISPLAY_FONT, HOME_CARD_FILL, HOME_TILE, INK, MUTED, SPACE, TYPE } from "@/lib/tokens";

// The scan card's watercolour, and the three tiles' (transparent ground).
const SCAN_ART = require("@/assets/illustrations/home-scan.webp");
const SEARCH_ART = require("@/assets/illustrations/home-find.webp");
const ROUTINE_ART = require("@/assets/illustrations/home-routine.webp");
const MATCH_ART = require("@/assets/illustrations/home-match.webp");

// v7 measurements, read off the hand-off.
const TAB_ROOT_TOP = 62;
const SCAN_CARD_MIN_HEIGHT = 176;
const SCAN_CARD_RADIUS = 24;
const SCAN_ART_SIZE = 150;
const SCAN_LINE_WIDTH = 180;
const TILE_ART = 64;

/**
 * Home (v7): the "Hi there" title; the scan card, with its own Scan now
 * button; and three tiles under it — Search, the skincare Routine, and My
 * match, which opens the skincare finder. The only warm tints in the app
 * outside a verdict are these. It scrolls only when large text needs it.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: Math.max(insets.top, TAB_ROOT_TOP - 8) + 8, paddingHorizontal: SPACE.gutter, paddingBottom: tabBarClearance(insets.bottom) }}
        alwaysBounceVertical={false}
        showsVerticalScrollIndicator={false}
      >
        <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.large, lineHeight: 33, letterSpacing: -0.6, color: INK }}>
          Hi there
        </Text>

        {/* The scan card: the one thing most people came to do. */}
        <View
          style={{
            marginTop: 16,
            minHeight: SCAN_CARD_MIN_HEIGHT,
            borderRadius: SCAN_CARD_RADIUS,
            backgroundColor: HOME_CARD_FILL,
            paddingVertical: 24,
            paddingHorizontal: 16,
            overflow: "hidden",
          }}
        >
          <Image
            source={SCAN_ART}
            contentFit="contain"
            accessibilityLabel=""
            style={{ position: "absolute", right: -4, bottom: -2, width: SCAN_ART_SIZE, height: SCAN_ART_SIZE }}
          />
          <Text style={{ fontSize: TYPE.card, fontWeight: "600", color: INK }}>Scan any product</Text>
          <Text style={{ marginTop: 4, maxWidth: SCAN_LINE_WIDTH, fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>
            Point at a barcode or the ingredient list.
          </Text>
          <PrimaryButton label="Scan now" onPress={openScanner} style={{ marginTop: 16, width: BUTTON_WIDTH.inCard }} />
        </View>

        {/* Three ways in, side by side. */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
          <Tile label="Search" art={SEARCH_ART} fill={HOME_TILE.sage} onPress={() => router.navigate("/browse")} />
          <Tile label="Routine" art={ROUTINE_ART} fill={HOME_TILE.butter} onPress={() => router.push("/routine")} />
          <Tile label="My match" art={MATCH_ART} fill={HOME_TILE.blush} onPress={() => router.push("/finder")} />
        </View>
      </ScrollView>
    </View>
  );
}

/** One of Home's three tiles: its picture, then its name. */
function Tile({ label, art, fill, onPress }: { label: string; art: number; fill: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flex: 1, alignItems: "center", gap: 8, borderRadius: CARD_RADIUS, backgroundColor: fill, paddingTop: 12, paddingHorizontal: 8, paddingBottom: 16 }}
      className="active:opacity-80"
    >
      <Image source={art} contentFit="contain" accessibilityLabel="" style={{ width: TILE_ART, height: TILE_ART }} />
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>
        {label}
      </Text>
    </Pressable>
  );
}
