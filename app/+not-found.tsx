import { router, Stack } from "expo-router";
import { Pressable, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { CANVAS, INK, MUTED, TOUCH_TARGET, TYPE } from "@/lib/tokens";

/**
 * Any link to a page that doesn't exist — a stale share, a mistyped deep
 * link. Without this file Expo Router showed its own black "Unmatched Route"
 * page with a sitemap link, which is developer tooling, not part of the app
 * (#298). Same shape as the product page's "Product not found".
 */
export default function NotFound() {
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Opened straight from a link there is nothing to go back to. */}
      <ScreenHeader onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 }}>
        <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: TYPE.heading, color: INK }}>
          Page not found
        </Text>
        <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>
          This link doesn&apos;t lead anywhere in the app.
        </Text>
        <PrimaryButton size={52} label="Go to Home" onPress={() => router.replace("/")} />
        <Pressable
          onPress={() => router.replace("/browse")}
          accessibilityRole="link"
          style={{ minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
            Search instead
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
