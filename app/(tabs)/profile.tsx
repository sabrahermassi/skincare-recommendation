import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect, useScrollToTop } from "expo-router";
import { TERRACOTTA } from "@/components/shell/shared";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/Text";
import { openQuiz } from "@/lib/open-quiz";
import { answeredWithoutSignal, isPersonalized, profileHeadline } from "@/lib/profile";
import { tabBarClearance } from "@/lib/tab-bar";
import { CANVAS, CARD_SHADOW, CHIP_SHADOW, CTA, DANGER, FLOATING_SHADOW, GRAY_FILL, INK, MUTED, SCRIM, SELECTED, SPACE, SURFACE, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";
import { haptic } from "@/lib/haptics";
import { noteProfileErased } from "@/lib/erase-notice";

const AVATAR = 120;
const AVATAR_ART = require("@/assets/illustrations/avatar-empty.webp");
// The menu's blocks: rounded, filled a shade off the page, with no line between rows.
const GROUP_RADIUS = 26;
const ROW_HEIGHT = 60;

/**
 * Profile — who you are to the app, and the way to everything about you: your
 * skin profile (the quiz answers, editable), the reference pages (Skincare
 * School, support, privacy), and deleting it all. The answers themselves are
 * edited on their own screen (`/skin-profile`).
 */
export default function Profile() {
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const resetApp = useAppStore((s) => s.resetApp);
  // Tapping the Profile tab while it is already showing scrolls back to the top.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const { title, tags } = profileHeadline(profile);

  // The one irreversible action here: it wipes the profile, the saved shelf and
  // the whole history, then clears AsyncStorage so the wipe survives a
  // relaunch — so it sits behind a real confirmation, not a single tap.
  const [confirmingErase, setConfirmingErase] = useState(false);
  // A tab stays mounted across a switch: leaving with the confirmation open
  // must not bring it back the next time.
  useFocusEffect(
    useCallback(() => {
      return () => setConfirmingErase(false);
    }, [setConfirmingErase]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS, paddingTop: insets.top }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: tabBarClearance(insets.bottom) }} showsVerticalScrollIndicator={false}>
        <Text
          style={{ paddingHorizontal: 24, paddingTop: 14, fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 26, color: INK }}
        >
          Profile
        </Text>

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

        {/* The menu, in blocks: your skin, your account, the reference pages, and
            deleting it all on its own at the end. */}
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
          <MenuGroup>
            <MenuRow icon="trash" label="Delete my profile" danger onPress={() => setConfirmingErase(true)} />
          </MenuGroup>
        </View>
      </ScrollView>

      <Modal visible={confirmingErase} transparent animationType="fade" onRequestClose={() => setConfirmingErase(false)}>
        <Pressable
          onPress={() => setConfirmingErase(false)}
          style={{ flex: 1, backgroundColor: SCRIM, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
        >
          {/* Swallows its own tap so tapping the card doesn't also hit the
              scrim's onPress behind it and dismiss the confirmation. */}
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 340, borderRadius: 20, backgroundColor: SURFACE, padding: 24, gap: 16, ...FLOATING_SHADOW }}
          >
            <Text style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 19, color: INK }}>Are you sure?</Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>
              This erases your profile, shelf and history. It can&apos;t be undone.
            </Text>
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={() => {
                  haptic.warning();
                  setConfirmingErase(false);
                  resetApp();
                  noteProfileErased();
                  router.replace("/onboarding");
                }}
                accessibilityRole="button"
                style={{ minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: DANGER }}
                className="active:opacity-90"
              >
                <Text style={{ fontSize: 14.5, fontWeight: "600", color: SURFACE }}>Yes, delete my profile</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmingErase(false)}
                accessibilityRole="button"
                style={{ minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: GRAY_FILL }}
                className="active:opacity-70"
              >
                <Text style={{ fontSize: 14.5, fontWeight: "600", color: INK }}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** One block of the menu: its rows share a rounded fill, with no line between them. */
function MenuGroup({ children }: { children: ReactNode }) {
  return <View style={{ borderRadius: GROUP_RADIUS, backgroundColor: SELECTED, paddingVertical: 4, overflow: "hidden" }}>{children}</View>;
}

/**
 * One row of the menu: an icon, its name, an optional badge, and an arrow —
 * except on a destructive row, which opens a confirmation rather than a screen
 * (#313).
 */
function MenuRow({
  icon,
  label,
  badge,
  onPress,
  danger = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  /** A short call to action beside the name, e.g. on a profile not filled in yet. */
  badge?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const color = danger ? DANGER : TERRACOTTA;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}. ${badge}` : label}
      className="active:opacity-60"
      style={{ minHeight: ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20 }}
    >
      <Ionicons name={icon} size={22} color={color} />
      <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: SPACE.text }}>
        <Text style={{ fontSize: TYPE.body, fontWeight: "500", color: danger ? DANGER : INK }}>{label}</Text>
        {badge ? (
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: CTA }}>
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: INK }}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {danger ? null : <Ionicons name="arrow-forward" size={22} color={color} />}
    </Pressable>
  );
}
