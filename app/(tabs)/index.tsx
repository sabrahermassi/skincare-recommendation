import { Image } from "expo-image";
import { router } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { BounceCard } from "@/components/BounceCard";
import { BUTTON_HEIGHT, BUTTON_WIDTH } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import { TipCard } from "@/components/TipCard";
import { openScanner } from "@/lib/open-scanner";
import { tabBarClearance, tabRootTop } from "@/lib/tab-bar";
import { BUTTON, CANVAS, CARD_RADIUS, HOME_SCAN_FILL, HOME_TILE, INK, MUTED, SCRIPT_FONT, SPACE, TYPE } from "@/lib/tokens";
import { FitScrollView } from "@/components/FitScrollView";

// The scan card's watercolour, and the two tiles' (transparent ground).
const SCAN_ART = require("@/assets/illustrations/home-scan-tube.webp");
const NEEDS_ART = require("@/assets/illustrations/home-skin-needs.webp");
const ROUTINE_ART = require("@/assets/illustrations/home-routine-v2.webp");

// v9 measurements, read off the hand-off.
const SCAN_CARD_MIN_HEIGHT = 188;
const SCAN_ART_WIDTH = 150;
const SCAN_LINE_WIDTH = 180;
const TILE_HEIGHT = 196;
const TILE_RADIUS = 20;

/**
 * Home (v9): "Hi there!" in the script face; the scan card, which is one big
 * button; an Explore heading over two tiles — Skin Needs (the concern
 * journey) and Skincare Routine, each with a one-line description — then
 * today's tip as an envelope. Cards dip when pressed and spring back
 * (`BounceCard`). It scrolls only when the content is taller than the screen.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <FitScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: tabRootTop(insets.top), paddingHorizontal: SPACE.gutter, paddingBottom: tabBarClearance(insets.bottom) }}
        showsVerticalScrollIndicator={false}
      >
        <Text accessibilityRole="header" style={{ fontFamily: SCRIPT_FONT, fontSize: 46, lineHeight: 48, color: INK }}>
          Hi there!
        </Text>

        {/* The scan card: the one thing most people came to do. The whole card is the button. */}
        <BounceCard
          onPress={() => openScanner()}
          pressedScale={0.97}
          accessibilityLabel="Scan Any Product"
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
            contentPosition="right center"
            accessibilityLabel=""
            style={{ position: "absolute", right: 12, top: 12, bottom: 12, width: SCAN_ART_WIDTH }}
          />
          <Text style={{ fontSize: TYPE.card, fontWeight: "600", color: INK }}>Scan Any Product</Text>
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

        <Text accessibilityRole="header" style={{ marginTop: SPACE.section, paddingHorizontal: 4, fontSize: TYPE.title, fontWeight: "600", color: INK }}>
          Explore
        </Text>

        {/* Two ways in, side by side. */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
          <Tile label="Skin Needs" description="Ingredients that suit you" art={NEEDS_ART} fill={HOME_TILE.match} onPress={() => router.push("/journey")} />
          <Tile label="Skincare Routine" description="Morning and night" art={ROUTINE_ART} fill={HOME_TILE.routine} onPress={() => router.push("/routine")} />
        </View>

        {/* One short tip a day, in an envelope. */}
        <TipCard />
      </FitScrollView>
    </View>
  );
}

/** One of Home's two tiles: its picture filling the room above, then its name and one line about it. */
function Tile({ label, description, art, fill, onPress }: { label: string; description: string; art: number; fill: string; onPress: () => void }) {
  return (
    <BounceCard
      onPress={onPress}
      pressedScale={0.94}
      accessibilityLabel={label}
      grow
      style={{ height: TILE_HEIGHT, borderRadius: TILE_RADIUS, backgroundColor: fill, paddingBottom: 12, gap: 2, overflow: "hidden" }}
    >
      <View style={{ flex: 1, paddingTop: 8, paddingHorizontal: 8 }}>
        <Image source={art} contentFit="contain" accessibilityLabel="" style={{ flex: 1 }} />
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ paddingTop: 4, paddingHorizontal: 16, fontSize: TYPE.card, lineHeight: 21, fontWeight: "600", color: INK }}>
        {label}
      </Text>
      <Text numberOfLines={2} style={{ paddingHorizontal: 16, fontSize: TYPE.caption, lineHeight: 17.5, color: MUTED }}>
        {description}
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
