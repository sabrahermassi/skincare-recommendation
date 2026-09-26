import { useIsFocused } from "expo-router";
import { useEffect } from "react";
import { AccessibilityInfo, Platform, Pressable, View } from "react-native";

import { Text } from "@/components/Text";
import { FIRST_PAGE_COPY, dismissFirstPage, useFirstPage } from "@/lib/first-page";
import { CARD_SHADOW, INK, MUTED, SPACE, SURFACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";

/**
 * "The first page of your journal" (#230), under the product screen's header,
 * where the Save that caused it was tapped. Never a sheet of its own: it sits
 * in the page and waits for "Got it".
 */
export function FirstPageMoment() {
  const showing = useFirstPage((s) => s.showing);
  const focused = useIsFocused();

  useEffect(() => {
    if (!showing || !focused) return;
    // Leaving the screen with the moment up counts as seen — it must not
    // wait and turn up on the next product opened.
    return () => dismissFirstPage();
  }, [showing, focused]);

  if (!showing || !focused) return null;
  return <Card />;
}

function Card() {
  useEffect(() => {
    // VoiceOver doesn't speak a view that appears; Android and web read it
    // from the live region below.
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(`${FIRST_PAGE_COPY.heading}. ${FIRST_PAGE_COPY.body}`);
  }, []);

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        marginHorizontal: SPACE.gutter,
        marginBottom: SPACE.text,
        borderRadius: 16,
        backgroundColor: SURFACE,
        padding: SPACE.block,
        gap: SPACE.text,
        ...CARD_SHADOW,
      }}
    >
      <Text className="font-display-medium" style={{ fontSize: TYPE.title, color: INK }}>
        {FIRST_PAGE_COPY.heading}
      </Text>
      <Text style={{ fontSize: TYPE.label, lineHeight: 20, color: MUTED }}>{FIRST_PAGE_COPY.body}</Text>
      <Pressable
        onPress={dismissFirstPage}
        accessibilityRole="button"
        style={{ alignSelf: "flex-end", minHeight: TOUCH_TARGET, justifyContent: "center" }}
        className="active:opacity-70"
      >
        <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>{FIRST_PAGE_COPY.dismiss}</Text>
      </Pressable>
    </View>
  );
}
