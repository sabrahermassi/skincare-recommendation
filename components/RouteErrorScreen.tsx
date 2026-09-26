import type { ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import { CANVAS, INK, MUTED, SPACE, TYPE } from "@/lib/tokens";

/** What the screen says. Exported for the tests. */
export const ROUTE_ERROR_COPY = {
  heading: "Something went wrong",
  body: "This screen hit a problem it couldn't recover from. Try again, or close the app and open it again.",
  retry: "Try again",
} as const;

/**
 * What a render crash shows instead of a blank or red screen (#152). Exported
 * from the root layout as Expo Router's `ErrorBoundary`, so it catches a throw
 * in any screen below it and offers to render it again.
 */
export function RouteErrorScreen({ error, retry }: ErrorBoundaryProps) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    console.error("Screen crashed:", error);
    // A crash before the first screen painted would otherwise leave the
    // splash up over this, with no way past it.
    void SplashScreen.hideAsync().catch(() => {});
  }, [error]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: CANVAS,
        alignItems: "center",
        justifyContent: "center",
        gap: SPACE.block,
        paddingHorizontal: 32,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <Text accessibilityRole="header" style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: TYPE.heading, color: INK, textAlign: "center" }}>
        {ROUTE_ERROR_COPY.heading}
      </Text>
      <Text style={{ fontSize: TYPE.body, lineHeight: 22, color: MUTED, textAlign: "center" }}>{ROUTE_ERROR_COPY.body}</Text>
      <PrimaryButton size={52} label={ROUTE_ERROR_COPY.retry} onPress={() => void retry()} style={{ alignSelf: "stretch" }} />
    </View>
  );
}
