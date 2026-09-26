import { useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { Text } from "@/components/Text";
import { COLORS } from "@/lib/colors";

/**
 * FOR.ME shell tokens — shared by `OnboardingShell` and `QuizShell` only.
 *
 * Not `lib/tokens.ts`: that file is the app's single source of
 * colour, and these are a different, unrelated palette (per
 * design-watercolor/FOR_ME_Onboarding_Design_Spec.md §2), used verbatim, not
 * sampled from a screenshot.
 */
/**
 * One color for the wordmark, the heart, the CTA button, and the active
 * progress dot — explicit unification request, superseding the earlier
 * split between this and a separate WORDMARK_COLOR pixel-sampled off the
 * reference art (that reference actually used two close-but-different
 * shades for the wordmark ink vs. the button fill; this value is neither
 * of those measurements, it's the single color requested to replace both).
 */
// Re-exported rather than declared, so the hex lives in `lib/colors.ts` with
// every other literal color this app hands to an RN prop. The names stay here
// because the reasoning above is about these names, and because ten files
// import them from this path.
export const TERRACOTTA = COLORS.shellTerracotta;
const SAND = COLORS.shellSand;
export const CHARCOAL = COLORS.shellCharcoal;
export const CTA_TEXT = COLORS.shellCtaText;

export const FONT = {
  headline: "CormorantGaramond_500Medium",
  bodyLight: "Montserrat_300Light",
  bodyRegular: "Montserrat_400Regular",
} as const;

/** Fixed pt values shared by both shells — spec §5/§17: nothing here scales
 *  per screen size except the hero/question regions each shell owns itself. */
export const H_PADDING = 24;

/** Three-dot progress indicator, shared by both shells' fixed regions. */
export function ProgressDots({ count, activeIndex }: { count: number; activeIndex: number }) {
  // 12 * 0.6 = 7.2 — 40% smaller than the previous size, per explicit request.
  const DOT_SIZE = 7.2;
  const DOT_GAP = 15;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: DOT_GAP }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            width: DOT_SIZE,
            height: DOT_SIZE,
            borderRadius: DOT_SIZE / 2,
            backgroundColor: i === activeIndex ? TERRACOTTA : SAND,
          }}
        />
      ))}
    </View>
  );
}

/** Skip's type size: the same on the intro screens and the quiz. */
const SKIP_SIZE = 17;

/** The top row Skip and the intro's Back sit on: 6% down the screen, never
 *  higher than the safe area plus 10. */
function useTopRow() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return Math.max(insets.top + 10, height * 0.06);
}

/**
 * The Skip at the top right of the intro screens and of the skin quiz: one
 * component so they cannot drift apart. Same spot, same font and size, the
 * same press fade; only the colour is the screen's own.
 */
export function SkipButton({ onPress, color }: { onPress: () => void; color: string }) {
  const [pressed, setPressed] = useState(false);
  const top = useTopRow();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={10}
      accessibilityRole="button"
      style={{
        position: "absolute",
        top,
        right: H_PADDING,
        minHeight: 44,
        minWidth: 44,
        alignItems: "flex-end",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      }}
    >
      <Text style={{ fontFamily: FONT.bodyRegular, fontSize: SKIP_SIZE, color }}>Skip</Text>
    </Pressable>
  );
}

/**
 * Back on the intro's second and third screens (#313): they swap in place
 * rather than being pushed, so iOS gives them no back of its own. Opposite
 * Skip, on the same row.
 */
export function ShellBackButton({ onPress, color }: { onPress: () => void; color: string }) {
  const top = useTopRow();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={{ position: "absolute", top, left: H_PADDING, minHeight: 44, minWidth: 44, justifyContent: "center" }}
      className="active:opacity-60"
    >
      <ArrowIcon direction="left" size={24} color={color} />
    </Pressable>
  );
}
