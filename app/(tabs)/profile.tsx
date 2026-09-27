import { Image } from "expo-image";
import { router, useScrollToTop } from "expo-router";
import { useRef } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MenuGroup, MenuRow } from "@/components/MenuRows";
import { TabTitle } from "@/components/TabTitle";
import { Text } from "@/components/Text";
import { answeredWithoutSignal, isPersonalized, profileHeadline } from "@/lib/profile";
import { tabBarClearance } from "@/lib/tab-bar";
import { CANVAS, CARD_SHADOW, INK, MUTED, SURFACE } from "@/lib/tokens";
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

          {/* No chips of the answers here (owner): the Skin profile row below
              holds them. A profile that doesn't score yet says how to fix that. */}
          {tags.length === 0 ? (
            // Tucked up under the title, centred as a block of its own.
            <Text style={{ alignSelf: "center", maxWidth: 280, marginTop: -10, fontSize: 13, lineHeight: 19, color: MUTED, textAlign: "center" }}>
              {answeredWithoutSignal(profile)
                ? "Scores aren't personal yet. Add your skin type or a concern when you know it."
                : "Answer a few questions and every score will be made for your skin."}
            </Text>
          ) : null}
        </View>

        {/* The menu, in blocks: your skin, your account, and the reference pages. */}
        <View style={{ paddingHorizontal: 20, gap: 14 }}>
          <MenuGroup>
            {/* The answers, one row each, to change at any time. */}
            <MenuRow
              icon="water"
              label="Skin profile"
              badge={isPersonalized(profile) ? undefined : "Tap to fill in"}
              onPress={() => router.push("/skin-profile")}
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
