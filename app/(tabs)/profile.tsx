import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useScrollToTop } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import { profileHeadline } from "@/lib/profile";
import { tabBarClearance } from "@/lib/tab-bar";
import { BORDER_INACTIVE, CANVAS, DANGER, INK, MUTED, MUTED_SOFT, SELECTED, SURFACE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

const AVATAR = 104;

/**
 * Profile — who you are to the app, and the way to everything about you: your
 * skin profile (the quiz answers, editable), support, privacy, and deleting it
 * all. The answers themselves are edited on their own screen (`/skin-profile`).
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
          {/* A placeholder for their own picture: a peach disc with the person glyph. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: AVATAR / 2,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: SELECTED,
              borderWidth: 2,
              borderColor: TERRACOTTA,
            }}
          >
            <Ionicons name="person" size={54} color={TERRACOTTA} />
          </View>

          <Text style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 26, color: INK, textAlign: "center" }}>{title}</Text>

          {tags.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14 }}>
              {tags.map((tag) => (
                <View key={tag} style={{ paddingHorizontal: 20, paddingVertical: 9, borderRadius: 999, backgroundColor: SELECTED }}>
                  <Text style={{ fontSize: 13, fontWeight: "500", letterSpacing: 0.2, color: INK }}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 13, color: MUTED, textAlign: "center" }}>
              Answer a few questions and every score will be made for your skin.
            </Text>
          )}
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: BORDER_INACTIVE }}>
          <MenuRow icon="water-outline" label="Skin profile" onPress={() => router.push("/skin-profile")} />
          <MenuRow icon="chatbubble-ellipses-outline" label="Support" onPress={() => router.push("/support")} />
          <MenuRow icon="shield-checkmark-outline" label="Privacy policy" onPress={() => router.push("/privacy")} />
          <MenuRow icon="trash-outline" label="Delete my profile" danger onPress={() => setConfirmingErase(true)} />
        </View>
      </ScrollView>

      <Modal visible={confirmingErase} transparent animationType="fade" onRequestClose={() => setConfirmingErase(false)}>
        <Pressable
          onPress={() => setConfirmingErase(false)}
          style={{ flex: 1, backgroundColor: "rgba(36,31,30,0.45)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
        >
          {/* Swallows its own tap so tapping the card doesn't also hit the
              scrim's onPress behind it and dismiss the confirmation. */}
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 340, borderRadius: 20, backgroundColor: SURFACE, padding: 24, gap: 16 }}
          >
            <Text style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 19, color: INK }}>Are you sure?</Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>
              This erases your profile, shelf and history. It can&apos;t be undone.
            </Text>
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={() => {
                  setConfirmingErase(false);
                  resetApp();
                  router.replace({ pathname: "/onboarding", params: { erased: "1" } });
                }}
                style={{ minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: DANGER }}
                className="active:opacity-90"
              >
                <Text style={{ fontSize: 14.5, fontWeight: "600", color: SURFACE }}>Yes, delete my profile</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmingErase(false)}
                style={{ minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, borderWidth: 1, borderColor: BORDER_INACTIVE }}
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

/** One row of the menu: an icon, its name, and an arrow. */
function MenuRow({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const color = danger ? DANGER : INK;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="active:opacity-70"
      style={{
        minHeight: 68,
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        paddingHorizontal: 24,
        borderBottomWidth: 1,
        borderBottomColor: BORDER_INACTIVE,
      }}
    >
      <Ionicons name={icon} size={22} color={danger ? DANGER : MUTED} />
      <Text style={{ flex: 1, fontSize: 16, fontWeight: "500", color }}>{label}</Text>
      <Ionicons name="arrow-forward" size={18} color={danger ? DANGER : MUTED_SOFT} />
    </Pressable>
  );
}
