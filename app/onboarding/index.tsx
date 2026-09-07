import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/Text";

import { POST_ONBOARDING_ROUTE } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

const HERO = require("@/assets/illustrations/illustration-22.png");

const FEATURES: { source: number; label: string; aspectRatio: number }[] = [
  { source: require("@/assets/illustrations/illustration-25.png"), label: "Scan", aspectRatio: 533 / 446 },
  { source: require("@/assets/illustrations/illustration-40.png"), label: "Analyze", aspectRatio: 460 / 418 },
  { source: require("@/assets/illustrations/illustration-30.png"), label: "Know", aspectRatio: 391 / 410 },
];

/**
 * Welcome — the first screen of the app, from
 * `assets/design_handoff_manassa_onboarding` (`onboarding.html`). Replaces
 * the earlier Ellow-branded Welcome screen.
 *
 * Two load-bearing details from the handoff, kept exactly as measured:
 *
 * - The 54px gap between the wordmark block and the icon row is fixed, not
 *   a third `flex:1` spacer. An earlier revision split the leftover height
 *   three ways and opened a ~170px void there — wider than the gap above
 *   the hero, which read as a bug. All the elastic air lives in the two
 *   spacers above and below instead, weighted 1 : 1.4 so the CTA gets more
 *   breathing room than the hero does.
 * - The icon row sits in a fixed 72px-tall, bottom-aligned box per icon.
 *   The three illustrations have different aspect ratios (1.21 / 1.11 /
 *   0.95); sized by width alone they'd land at three different heights and
 *   put "Scan" / "Analyze" / "Know" on three different baselines.
 *
 * Muted text uses `#96605A` rather than the handoff's literal `#9B665B` —
 * both are used for it in the handoff, but only `#96605A` clears 4.5:1 body
 * text contrast against the canvas (4.68:1 vs 4.34:1), and the handoff
 * calls the swap "visually indistinguishable". The button fill's low
 * contrast against the canvas (1.51:1) is left as specified — the handoff
 * flags a hairline border as the fix but says that call belongs to the
 * designer, since it departs from the "no border, no shadow" spec.
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
        <Image
          source={HERO}
          style={{ width: "100%", maxWidth: 300, aspectRatio: 637 / 541 }}
          contentFit="contain"
          accessibilityLabel=""
        />
      </View>

      <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 24, paddingTop: 22 }}>
        <Text
          style={{
            fontFamily: "PlayfairDisplay_500Medium",
            fontSize: 40,
            lineHeight: 40,
            letterSpacing: 40 * -0.018,
            color: "#5A342C",
          }}
        >
          Manassa
        </Text>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "400",
            lineHeight: 22.5,
            color: "#96605A",
            textAlign: "center",
          }}
        >
          Find your skin’s perfect match
        </Text>
      </View>

      {/* Fixed, not elastic — see the module doc comment. */}
      <View style={{ height: 54 }} />

      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 24 }}>
        {FEATURES.map(({ source, label, aspectRatio }) => (
          <View key={label} style={{ flex: 1, alignItems: "center", gap: 10, minWidth: 0 }}>
            <View
              style={{
                height: 72,
                width: "100%",
                alignItems: "center",
                justifyContent: "flex-end",
              }}
            >
              <Image
                source={source}
                style={{ height: 72, maxWidth: "100%", aspectRatio }}
                contentFit="contain"
                accessibilityLabel=""
              />
            </View>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                letterSpacing: 12 * -0.004,
                color: "#5A342C",
                textAlign: "center",
              }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flex: 1.4, minHeight: 28 }} />

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(32, insets.bottom + 16), gap: 4 }}>
        <Pressable
          onPress={scanFirstProduct}
          accessibilityRole="button"
          style={({ pressed }) => ({
            minHeight: 50,
            borderRadius: 26,
            backgroundColor: pressed ? "#E8AC8E" : "#F2BFA6",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Text style={{ fontSize: 15, fontWeight: "500", color: "#5A342C" }}>
            Scan my first product
          </Text>
        </Pressable>
        <Pressable
          onPress={setUpProfileFirst}
          accessibilityRole="button"
          style={({ pressed }) => ({
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: 13.5, fontWeight: "500", color: "#96605A", textAlign: "center" }}>
            Set up my skin profile first
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
