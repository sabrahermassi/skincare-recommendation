import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/Text";

import { POST_ONBOARDING_ROUTE } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

const HERO_BASE = require("@/assets/illustrations/onboarding/hero-base.png");
const HERO_ARM = require("@/assets/illustrations/onboarding/hero-arm.png");
const HERO_SPARKLES = require("@/assets/illustrations/onboarding/hero-sparkles.png");
const SCAN_BASE = require("@/assets/illustrations/onboarding/scan-base.png");
const SCAN_BARCODE = require("@/assets/illustrations/onboarding/scan-barcode.png");
const SCAN_SPARKLE = require("@/assets/illustrations/onboarding/scan-sparkle.png");
const ANALYZE_PAPER = require("@/assets/illustrations/onboarding/analyze-paper.png");
const ANALYZE_MAGNIFIER = require("@/assets/illustrations/onboarding/analyze-magnifier.png");
const KNOW_BASE = require("@/assets/illustrations/onboarding/know-base.png");
const KNOW_CHECKMARK = require("@/assets/illustrations/onboarding/know-checkmark.png");
const KNOW_SPARKLE = require("@/assets/illustrations/onboarding/know-sparkle.png");

const ABS_FILL = { position: "absolute", width: "100%", height: "100%" } as const;

/**
 * Welcome — the first screen of the app, from
 * `design_handoff_manassa_onboarding_animated` (`onboarding.html`), laid out
 * and asset-complete but deliberately **static for now**: an animated build
 * of this same screen (Reanimated-driven hero lean/arm swing/sparkle fades,
 * a scan sweep, a pulsing checkmark) caused the app to exit outright in Expo
 * Go, with no JS-catchable error to diagnose from. That investigation is
 * parked rather than blocking the rest of the app — this static version uses
 * the same final layout and the same eleven layered PNGs (they were built
 * for the animated version but read here as plain stacked images), so
 * nothing about the visual design is lost, only the motion.
 */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const skipOnboarding = useAppStore((s) => s.skipOnboarding);

  function scanFirstProduct() {
    skipOnboarding();
    router.replace(POST_ONBOARDING_ROUTE);
  }

  function setUpProfileFirst() {
    router.push("/onboarding/concerns");
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#FBF4EE" }}>
      <View style={{ flex: 1, minHeight: Math.max(20, insets.top) }} />

      <View style={{ alignItems: "center", paddingHorizontal: 24 }}>
        <View style={{ width: "100%", maxWidth: 300, aspectRatio: 637 / 541 }}>
          <Image source={HERO_BASE} style={ABS_FILL} contentFit="contain" accessibilityLabel="" />
          <Image source={HERO_ARM} style={ABS_FILL} contentFit="contain" accessibilityLabel="" />
          <Image source={HERO_SPARKLES} style={ABS_FILL} contentFit="contain" accessibilityLabel="" />
        </View>
      </View>

      <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 24, paddingTop: 22 }}>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 40, color: "#5A342C" }}>
          Manassa
        </Text>
        <Text style={{ fontSize: 15, color: "#96605A", textAlign: "center" }}>
          Find your skin’s perfect match
        </Text>
      </View>

      <View style={{ height: 54 }} />

      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 24 }}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <View style={{ height: 84, width: "100%", alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 98.5, height: 82.4 }}>
              <Image source={SCAN_BASE} style={ABS_FILL} contentFit="contain" accessibilityLabel="" />
              <Image source={SCAN_BARCODE} style={ABS_FILL} contentFit="contain" accessibilityLabel="" />
              <Image source={SCAN_SPARKLE} style={ABS_FILL} contentFit="contain" accessibilityLabel="" />
            </View>
          </View>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#5A342C" }}>Scan</Text>
        </View>

        <View style={{ alignItems: "center", gap: 10 }}>
          <View style={{ height: 84, width: "100%", alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 78, height: 70.9 }}>
              <Image source={ANALYZE_PAPER} style={ABS_FILL} contentFit="contain" accessibilityLabel="" />
              <Image source={ANALYZE_MAGNIFIER} style={ABS_FILL} contentFit="contain" accessibilityLabel="" />
            </View>
          </View>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#5A342C" }}>Analyze</Text>
        </View>

        <View style={{ alignItems: "center", gap: 10 }}>
          <View style={{ height: 84, width: "100%", alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 56, height: 58.7 }}>
              <Image source={KNOW_BASE} style={ABS_FILL} contentFit="contain" accessibilityLabel="" />
              <Image source={KNOW_CHECKMARK} style={ABS_FILL} contentFit="contain" accessibilityLabel="" />
              <Image source={KNOW_SPARKLE} style={ABS_FILL} contentFit="contain" accessibilityLabel="" />
            </View>
          </View>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#5A342C" }}>Know</Text>
        </View>
      </View>

      <View style={{ flex: 1.4, minHeight: 28 }} />

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(32, insets.bottom + 16), gap: 4 }}>
        <Pressable
          onPress={scanFirstProduct}
          accessibilityRole="button"
          style={{
            minHeight: 50,
            borderRadius: 26,
            backgroundColor: "#F2BFA6",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: "500", color: "#5A342C" }}>
            Scan my first product
          </Text>
        </Pressable>
        <Pressable
          onPress={setUpProfileFirst}
          accessibilityRole="button"
          style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 13.5, fontWeight: "500", color: "#96605A", textAlign: "center" }}>
            Set up my skin profile first
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
