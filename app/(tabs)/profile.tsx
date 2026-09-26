import { Image } from "expo-image";
import { router, useScrollToTop } from "expo-router";
import { useRef } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MenuGroup, MenuRow } from "@/components/MenuRows";
import { TabTitle } from "@/components/TabTitle";
import { Text } from "@/components/Text";
import { openQuiz } from "@/lib/open-quiz";
import { answeredWithoutSignal, isPersonalized, profileHeadline } from "@/lib/profile";
import { tabBarClearance } from "@/lib/tab-bar";
import { CANVAS, CARD_SHADOW, CHIP_SHADOW, INK, MUTED, SELECTED, SURFACE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

const AVATAR = 120;
const AVATAR_ART = require("@/assets/illustrations/avatar-empty.webp");

/**
 * Profile — who you are to the app, and the way to everything about you: your
 * skin profile (the quiz answers, editable), the reference pages (Skincare
 * School, support, privacy). The answers themselves are edited on their own
 * screen (`/skin-profile`); deleting it all lives on Account (owner).
 */
export default function Profile() {
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  // Tapping the Profile tab while it is already showing scrolls back to the top.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const { title, tags } = profileHeadline(profile);

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS, paddingTop: insets.top }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: tabBarClearance(insets.bottom) }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
          <TabTitle>Profile</TabTitle>
        </View>

        <View style={{ alignItems: "center", gap: 20, paddingTop: 30, paddingBottom: 38, paddingHorizontal: 24 }}>
          {/* A placeholder for their own picture: the watercolor empty avatar. Its
              shade sits on a plain disc behind it, since the picture is see-through. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: SURFACE, ...CARD_SHADOW }}
          >
            <Image source={AVATAR_ART} contentFit="contain" accessibilityLabel="" style={{ width: AVATAR, height: AVATAR }} />
          </View>

          <Text style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 26, color: INK, textAlign: "center" }}>{title}</Text>

          {tags.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14 }}>
              {tags.map((tag) => (
                <View key={tag} style={{ paddingHorizontal: 20, paddingVertical: 9, borderRadius: 999, backgroundColor: SELECTED, ...CHIP_SHADOW }}>
                  <Text style={{ fontSize: 13, fontWeight: "500", letterSpacing: 0.2, color: INK }}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : (
            // Tucked up under the title, centred as a block of its own.
            <Text style={{ alignSelf: "center", maxWidth: 280, marginTop: -10, fontSize: 13, lineHeight: 19, color: MUTED, textAlign: "center" }}>
              {answeredWithoutSignal(profile)
                ? "Scores aren't personal yet. Add your skin type or a concern when you know it."
                : "Answer a few questions and every score will be made for your skin."}
            </Text>
          )}
        </View>

        {/* The menu, in blocks: your skin, your account, and the reference pages. */}
        <View style={{ paddingHorizontal: 20, gap: 14 }}>
          <MenuGroup>
            {/* Edits the answers once they score; until then, asks the questions (#346). */}
            <MenuRow
              icon="water"
              label="Skin profile"
              badge={isPersonalized(profile) ? undefined : "Tap to fill in"}
              onPress={() => (isPersonalized(profile) ? router.push("/skin-profile") : openQuiz())}
            />
            <MenuRow icon="sparkles" label="Skincare routine" onPress={() => router.push("/routine")} />
          </MenuGroup>
          <MenuGroup>
            <MenuRow icon="person-circle" label="Account" onPress={() => router.push("/account")} />
          </MenuGroup>
          <MenuGroup>
            <MenuRow icon="shield-checkmark" label="Privacy policy" onPress={() => router.push("/privacy")} />
            <MenuRow icon="chatbubbles" label="Support" onPress={() => router.push("/support")} />
          </MenuGroup>
        </View>
      </ScrollView>

    </View>
  );
}
