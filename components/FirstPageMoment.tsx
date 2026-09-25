import { useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, View } from "react-native";

import { Text } from "@/components/Text";
import { FIRST_PAGE_COPY, dismissFirstPage, useFirstPage } from "@/lib/first-page";
import { CARD_SHADOW, INK, MUTED, SPACE, SURFACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";

/**
 * How long after the product screen gets the focus back before the moment
 * appears. The screen is focused as soon as the sign-in sheet starts to close,
 * and the moment must not be seen beside a sheet still sliding away (#230).
 * Longer than iOS's sheet dismissal; the device check in the PR confirms it.
 */
export const AFTER_SHEET_MS = 500;

/**
 * "The first page of your journal" (#230), under the product screen's header,
 * where the Save that caused it was tapped. Never a sheet of its own: it sits
 * in the page and waits for "Got it".
 */
export function FirstPageMoment() {
  const showing = useFirstPage((s) => s.showing);
  const focused = useIsFocused();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!showing || !focused) return;
    const timer = setTimeout(() => setSettled(true), AFTER_SHEET_MS);
    return () => {
      clearTimeout(timer);
      setSettled(false);
      // Leaving the screen with the moment up, or on its way up, counts as
      // seen — it must not wait and turn up on the next product opened.
      dismissFirstPage();
    };
  }, [showing, focused]);

  if (!showing || !focused || !settled) return null;
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
      >
        <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>{FIRST_PAGE_COPY.dismiss}</Text>
      </Pressable>
    </View>
  );
}
