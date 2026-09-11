import { useState } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { Text } from "@/components/Text";
import { CANVAS } from "@/lib/tokens";

/**
 * FOR.ME shell tokens — shared by `OnboardingShell` and `QuizShell` only.
 *
 * Not `lib/tokens.ts`: that file is the Manassa system's single source of
 * colour, and these are a different, unrelated palette (per
 * design-watercolor/FOR_ME_Onboarding_Design_Spec.md §2), used verbatim, not
 * sampled from a screenshot. `CANVAS` is the one exception — the FOR.ME
 * cream was adopted as the app-wide background, so it's re-exported from
 * `lib/tokens.ts` here rather than kept as a second copy of the same value.
 */
export { CANVAS };
/**
 * One color for the wordmark, the heart, the CTA button, and the active
 * progress dot — explicit unification request, superseding the earlier
 * split between this and a separate WORDMARK_COLOR pixel-sampled off the
 * reference art (that reference actually used two close-but-different
 * shades for the wordmark ink vs. the button fill; this value is neither
 * of those measurements, it's the single color requested to replace both).
 */
export const TERRACOTTA = "#C4654F";
export const SAND = "#E8DDD1";
export const CHARCOAL = "#2E2E2E";
export const MUTED = "#7A706B";
export const CTA_TEXT = "#FFFFFF";

export const FONT = {
  wordmark: "MrsSaintDelafield_400Regular",
  headline: "CormorantGaramond_500Medium",
  bodyLight: "Montserrat_300Light",
  bodyRegular: "Montserrat_400Regular",
} as const;

/** Fixed pt values shared by both shells — spec §5/§17: nothing here scales
 *  per screen size except the hero/question regions each shell owns itself. */
export const H_PADDING = 24;

export type PrimaryButtonSize = "large" | "default";

/** large = onboarding's 56pt CTA. default = the quiz's 48pt Continue. */
const BUTTON_HEIGHT: Record<PrimaryButtonSize, number> = {
  large: 56,
  default: 48,
};

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  /** @default "large" */
  size?: PrimaryButtonSize;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The one CTA both shells render. Colour, corner radius (always a true
 * pill — radius = height/2) and label styling live here once; only height
 * varies, via `size`, so onboarding and the quiz can never drift onto two
 * different button designs the way the rest of the app's buttons did before
 * `components/PrimaryButton.tsx` was unified (see that file's own comment).
 *
 * This is a distinct component from `components/PrimaryButton.tsx` — that
 * one is the Manassa system's button (accent/cta tone, sizes 50/52/56) and
 * still backs every screen outside onboarding/quiz. Same name, different
 * module, imported nowhere in common: not a collision.
 */
export function PrimaryButton({
  label,
  onPress,
  size = "large",
  disabled = false,
  accessibilityLabel,
  style,
}: PrimaryButtonProps) {
  const [pressed, setPressed] = useState(false);
  const height = BUTTON_HEIGHT[size];

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={[
        {
          height,
          borderRadius: height / 2,
          backgroundColor: disabled ? SAND : TERRACOTTA,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: FONT.bodyRegular, fontSize: size === "large" ? 18 : 16, color: CTA_TEXT }}>
        {label}
      </Text>
    </Pressable>
  );
}

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
