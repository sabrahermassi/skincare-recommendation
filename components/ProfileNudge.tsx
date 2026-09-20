import { router } from "expo-router";
import { View } from "react-native";

import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { PressableCard } from "@/components/PressableCard";
import { Text } from "@/components/Text";
import { isPersonalized } from "@/lib/profile";
import { INK, SELECTED, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

/**
 * Skipping the quiz costs the user their score, and this is the way back: one
 * line on the product screen, with an arrow into the skin profile screen where
 * the answers are given. It used to ask the two questions right here; that
 * turned a result screen into a form, so it now points instead. It goes away on
 * its own once the profile has an answer.
 */
export function ProfileNudge() {
  const personalized = useAppStore((s) => isPersonalized(s.profile));
  if (personalized) return null;

  return (
    <View style={{ marginHorizontal: 24 }}>
      <PressableCard
        onPress={() => router.push("/skin-profile")}
        accessibilityLabel="You're one tap away from your perfect score. Open your skin profile."
        backgroundColor={SELECTED}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 18, paddingHorizontal: 20 }}
      >
        <Text
          style={{ flex: 1, fontFamily: "PlayfairDisplay_500Medium", fontSize: TYPE.title, lineHeight: 25, color: INK }}
        >
          You&apos;re one tap away from your perfect score
        </Text>
        <ArrowIcon kind="arrow" size={22} color={INK} />
      </PressableCard>
    </View>
  );
}
