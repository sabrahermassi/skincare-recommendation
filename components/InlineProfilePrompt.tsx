import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";
// One selected-outline colour app-wide — same reuse of the FOR.ME shell token
// that browse.tsx and profile.tsx already document.
import { TERRACOTTA } from "@/components/shell/shared";
import type { BaseSkinType, Sensitivity } from "@/data/types";
import {
  BORDER_INACTIVE,
  CANVAS,
  INK,
  MUTED,
  MUTED_FAINT,
  RADIUS_SELECTOR,
  SELECTED,
  TOUCH_TARGET,
  TYPE,
} from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

/**
 * The two questions that unlock a score, asked on the screen that needs them.
 *
 * Skipping the quiz is a rational thing to do before you trust an app, and it
 * used to cost the user everything: `verdictHeadline` answered a scan with
 * "Answer a few questions and we can tell you how this suits you" — a sentence
 * telling someone standing in a shop, holding a bottle, to go and do the thing
 * they declined minutes ago. The app's whole promise failed at the exact moment
 * of highest intent.
 *
 * So the questions come here instead of sending anyone back to onboarding.
 * Skin type and sensitivity are the two that move the score most; concerns and
 * pregnancy stay in the quiz and in Profile, and the note at the bottom says so
 * rather than implying this is the whole picture.
 *
 * Deliberately NOT offering "I don't know" for skin type, though the quiz does
 * and the profile stores it as a real answer: `isPersonalized` treats a null
 * skin type as unanswered, so that option would leave someone tapping a choice
 * and watching nothing happen. Not answering has the same meaning and is
 * already available — by not answering.
 */

const SKIN_TYPES: { value: BaseSkinType; label: string }[] = [
  { value: "dry", label: "Dry" },
  { value: "oily", label: "Oily" },
  { value: "combination", label: "Combination" },
  { value: "normal", label: "Normal" },
];

const SENSITIVITIES: { value: Sensitivity; label: string }[] = [
  { value: "none", label: "Not sensitive" },
  { value: "some", label: "Somewhat" },
  { value: "high", label: "Very sensitive" },
];

export function InlineProfilePrompt() {
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);

  const hasType = profile.baseSkinType !== null;
  const hasSensitivity = profile.sensitivity !== null;

  return (
    <View
      style={{
        marginHorizontal: 24,
        marginTop: 20,
        padding: 20,
        gap: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: BORDER_INACTIVE,
        backgroundColor: CANVAS,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text
          style={{
            fontFamily: "PlayfairDisplay_500Medium",
            fontSize: TYPE.title,
            lineHeight: 25,
            color: INK,
          }}
        >
          {hasType ? "Scored from your answers" : "Two taps and we can score this"}
        </Text>
        <Text style={{ fontSize: TYPE.label, lineHeight: 20, color: MUTED }}>
          {hasType
            ? "Change either answer and the score above updates."
            : "These are the two answers that change this product's score most."}
        </Text>
      </View>

      <Field label="Your skin">
        {SKIN_TYPES.map((option) => (
          <Choice
            key={option.value}
            label={option.label}
            selected={profile.baseSkinType === option.value}
            onPress={() => setProfile({ baseSkinType: option.value })}
          />
        ))}
      </Field>

      <Field label="Sensitivity">
        {SENSITIVITIES.map((option) => (
          <Choice
            key={option.value}
            label={option.label}
            selected={profile.sensitivity === option.value}
            onPress={() => setProfile({ sensitivity: option.value })}
          />
        ))}
      </Field>

      {hasType && (
        <Text style={{ fontSize: TYPE.caption, lineHeight: 17, color: MUTED_FAINT }}>
          {hasSensitivity
            ? "Scored from two answers. Your concerns and pregnancy status are still unanswered — add them in Profile and the warnings get more specific."
            : "Answer sensitivity too and we can judge irritants properly."}
        </Text>
      )}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontSize: TYPE.caption,
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: 0.9,
          color: MUTED_FAINT,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>
    </View>
  );
}

/** Mirrors browse.tsx's `TypeChip`, including its platform touch target. */
function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={{
        height: TOUCH_TARGET,
        paddingHorizontal: 16,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: RADIUS_SELECTOR,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? TERRACOTTA : BORDER_INACTIVE,
        backgroundColor: selected ? SELECTED : CANVAS,
      }}
    >
      <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: selected ? INK : MUTED }}>
        {label}
      </Text>
    </Pressable>
  );
}
