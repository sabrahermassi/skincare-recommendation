import { Image } from "expo-image";
import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { BounceCard } from "@/components/BounceCard";
import { BUTTON_HEIGHT, BUTTON_WIDTH } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import { TipCard } from "@/components/TipCard";
import { openScanner } from "@/lib/open-scanner";
import { tabBarClearance, tabRootTop } from "@/lib/tab-bar";
import { BUTTON, CANVAS, CARD_RADIUS, DISPLAY_FONT, HOME_SCAN_FILL, HOME_TILE, INK, MUTED, SPACE, TYPE } from "@/lib/tokens";

// The scan card's watercolour, and the two tiles' (transparent ground).
const SCAN_ART = require("@/assets/illustrations/home-scan.webp");
const ROUTINE_ART = require("@/assets/illustrations/home-routine.webp");
const MATCH_ART = require("@/assets/illustrations/home-match.webp");

// v9 measurements, read off the hand-off.
const SCAN_CARD_MIN_HEIGHT = 176;
const SCAN_ART_SIZE = 150;
const SCAN_LINE_WIDTH = 180;
const TILE_ART_HEIGHT = 118;

/**
 * Home (v9): the "Hi there" title; the scan card, which is one big button;
 * two tiles under it — What my skin needs (the concern journey) and the
 * Skincare routine — then the Tip of the day. Cards dip when pressed and
 * spring back (`BounceCard`). It scrolls only when large text needs it.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: tabRootTop(insets.top), paddingHorizontal: SPACE.gutter, paddingBottom: tabBarClearance(insets.bottom) }}
        alwaysBounceVertical={false}
        showsVerticalScrollIndicator={false}
      >
        <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.large, lineHeight: 33, letterSpacing: -0.6, color: INK }}>
          Hi there
        </Text>

        {/* The scan card: the one thing most people came to do. The whole card is the button. */}
        <BounceCard
          onPress={() => openScanner()}
          pressedScale={0.97}
          accessibilityLabel="Scan any product"
          style={{
            marginTop: 16,
            minHeight: SCAN_CARD_MIN_HEIGHT,
            borderRadius: CARD_RADIUS,
            backgroundColor: HOME_SCAN_FILL,
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
          {/* Looks like the filled button, but the card is what's pressed. */}
          <View
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={{ marginTop: 16, width: BUTTON_WIDTH.inCard, height: BUTTON_HEIGHT, borderRadius: BUTTON_HEIGHT / 2, backgroundColor: BUTTON.primary.fill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <BarcodeIcon />
            <Text style={{ fontSize: 16, fontWeight: "600", letterSpacing: -0.16, color: BUTTON.primary.label }}>Scan now</Text>
          </View>
        </BounceCard>

        {/* Two ways in, side by side. */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
          <Tile label="What my skin needs" art={MATCH_ART} fill={HOME_TILE.match} onPress={() => router.push("/journey")} />
          <Tile label="Skincare routine" art={ROUTINE_ART} fill={HOME_TILE.routine} onPress={() => router.push("/routine")} />
        </View>

        {/* A short tip, a new one each day. */}
        <TipCard />
      </ScrollView>
    </View>
  );
}

/** One of Home's two tiles: its picture filling the tile's width, then its name. */
function Tile({ label, art, fill, onPress }: { label: string; art: number; fill: string; onPress: () => void }) {
  return (
    <BounceCard
      onPress={onPress}
      pressedScale={0.94}
      accessibilityLabel={label}
      grow
      style={{ alignItems: "center", gap: 4, borderRadius: CARD_RADIUS, backgroundColor: fill, paddingTop: 8, paddingHorizontal: 8, paddingBottom: 16 }}
    >
      <Image source={art} contentFit="contain" accessibilityLabel="" style={{ width: "100%", height: TILE_ART_HEIGHT }} />
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>
        {label}
      </Text>
    </BounceCard>
  );
}

/** The barcode-scanner glyph on "Scan now" (v9, the hand-off's path). */
function BarcodeIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8"
        stroke={BUTTON.primary.label}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
