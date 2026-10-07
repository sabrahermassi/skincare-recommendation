import { Image } from "expo-image";
import { router, useScrollToTop } from "expo-router";
import { useRef } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MenuGroup, MenuRow } from "@/components/MenuRows";
import { TabTitle } from "@/components/TabTitle";
import { Text } from "@/components/Text";
import { answeredWithoutSignal, isPersonalized, profileHeadline } from "@/lib/profile";
import { tabBarClearance, tabRootTop } from "@/lib/tab-bar";
import { AVATAR_FILL, CANVAS, LINE, MUTED, SPACE, TYPE, WHITE, LEADING } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";
import { useSafetyNoticeEnabled } from "@/lib/features";
import { FitScrollView } from "@/components/FitScrollView";
import { clearTestData, fillTestData } from "@/lib/dev-test-data";
import { noOrphan } from "@/lib/text";

// The avatar (v7): 112pt, in a 4pt white ring.
const AVATAR = 112;
const AVATAR_RING = 4;
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
  const safetyNoticeEnabled = useSafetyNoticeEnabled();
  const setSafetyNoticeEnabled = useAppStore((s) => s.setSafetyNoticeEnabled);
  // Tapping the Profile tab while it is already showing scrolls back to the top.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const { tags } = profileHeadline(profile);

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <FitScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingTop: tabRootTop(insets.top), paddingBottom: tabBarClearance(insets.bottom) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: SPACE.gutter }}>
          <TabTitle>Profile</TabTitle>
        </View>

        <View style={{ alignItems: "center", gap: SPACE.gutter, paddingTop: SPACE.section, paddingHorizontal: SPACE.section }}>
          {/* A placeholder for their own picture: the watercolor empty avatar on
              its disc, in a white ring with a hairline outside it (v7, v9 colours). */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: AVATAR + AVATAR_RING * 2 + 3,
              height: AVATAR + AVATAR_RING * 2 + 3,
              borderRadius: 999,
              borderWidth: 1.5,
              borderColor: LINE,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: WHITE,
            }}
          >
            <View style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, overflow: "hidden", backgroundColor: AVATAR_FILL }}>
              <Image source={AVATAR_ART} contentFit="cover" accessibilityLabel="" style={{ width: AVATAR, height: AVATAR }} />
            </View>
          </View>

          {/* A profile that doesn't score yet says how to fix that; the answers
              themselves are on the Skin profile row below (owner). One that
              scores (a skin type alone will) is not told to answer again. */}
          {tags.length === 0 && !isPersonalized(profile) ? (
            <Text style={{ maxWidth: 300, fontSize: TYPE.body, lineHeight: LEADING.body, color: MUTED, textAlign: "center" }}>
              {noOrphan(
                answeredWithoutSignal(profile)
                  ? "Scores aren't personal yet. Add your skin type or a concern when you know it."
                  : "Answer a few questions and every score will be made for your skin.",
              )}
            </Text>
          ) : null}
        </View>

        {/* The menu, in two blocks (v7): your skin, then your account and the reference pages. */}
        <View style={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.section, gap: SPACE.section }}>
          <MenuGroup soft>
            {/* The answers, one row each, to change at any time. */}
            <MenuRow
              icon="water"
              label="Skin profile"
              badge={isPersonalized(profile) ? undefined : "Tap to fill in"}
              onPress={() => router.push("/skin-profile")}
            />
            <MenuRow icon="list" label="Skincare routine" onPress={() => router.push("/routine")} />
          </MenuGroup>
          <MenuGroup soft>
            <MenuRow icon="person-circle" label="Account" onPress={() => router.push("/account")} />
            <MenuRow icon="shield-checkmark" label="Privacy policy" onPress={() => router.push("/privacy")} />
            <MenuRow icon="chatbubbles" label="Support" onPress={() => router.push("/support")} />
          </MenuGroup>
          {/* Development builds only (owner): long lists and a ten-step
              routine to test scrolling with, and the regulatory-safety flag
              (#403). A release build has no such rows. */}
          {__DEV__ ? (
            <MenuGroup soft>
              <MenuRow
                icon="flask"
                label="Fill with test data"
                onPress={() => void fillTestData().catch((err) => console.warn("fillTestData failed:", err))}
              />
              <MenuRow icon="trash" label="Remove all saved, history and starred" onPress={clearTestData} />
              <MenuRow
                icon="shield"
                label="EU safety notice"
                value={safetyNoticeEnabled ? "On" : "Off"}
                chevron={false}
                onPress={() => setSafetyNoticeEnabled(!safetyNoticeEnabled)}
              />
            </MenuGroup>
          ) : null}
        </View>
      </FitScrollView>

    </View>
  );
}
