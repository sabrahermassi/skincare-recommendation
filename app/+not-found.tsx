import { router, Stack } from "expo-router";
import { View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { CANVAS } from "@/lib/tokens";

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
      <View style={{ flex: 1, justifyContent: "center", paddingBottom: 80 }}>
        <EmptyState
          art={LOST_ART}
          aspect={LOST_ASPECT}
          artWidth={280}
          title="This page wandered off"
          line="The link may be old, or the page has moved."
          action={<PrimaryButton label="Go to Home" onPress={() => router.replace("/")} style={{ width: BUTTON_WIDTH.secondary }} />}
        />
      </View>
    </View>
  );
}

// The same picture as a barcode we don't have (v7), at its own proportions.
const LOST_ART = require("@/assets/illustrations/no-product-found.webp");
const LOST_ASPECT = 1164 / 697;
