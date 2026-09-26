import { Pressable, View } from "react-native";

import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { Text, useIconScale } from "@/components/Text";
import { openQuiz } from "@/lib/open-quiz";
import { quizStepCount } from "@/lib/profile";
import { BORDER_INACTIVE, CARD_SHADOW, INK, MUTED, SPACE, SURFACE, TYPE } from "@/lib/tokens";

/**
 * "See your skin match" (#346): what a result shows in place of a score when
 * there is no skin profile yet. Opens the skin quiz over this screen, which
 * shows the score once it closes with enough answered.
 */
export function SkinMatchCard() {
  const body = `See how this fits your skin — ${quizStepCount()} quick questions.`;
  // Grows with the words beside it on a result's reading screen (#334).
  const arrow = 22 * useIconScale(TYPE.label);
  return (
    <Pressable
      onPress={openQuiz}
      accessibilityRole="button"
      accessibilityLabel={`See your skin match. ${body}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACE.block,
        paddingHorizontal: 20,
        paddingVertical: 22,
        borderWidth: 1,
        borderColor: BORDER_INACTIVE,
        backgroundColor: SURFACE,
        ...CARD_SHADOW,
      }}
      className="rounded-card active:opacity-70"
    >
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: TYPE.title, lineHeight: 23, color: INK }}>
          See your skin match
        </Text>
        <Text style={{ fontSize: TYPE.label, lineHeight: 20, color: MUTED }}>{body}</Text>
      </View>
      <View testID="skin-match-arrow" style={{ width: arrow, height: arrow }}>
        <ArrowIcon size={arrow} color={INK} />
      </View>
    </Pressable>
  );
}
