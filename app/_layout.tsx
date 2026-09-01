import "../global.css";

import { Fraunces_600SemiBold, Fraunces_700Bold } from "@expo-google-fonts/fraunces";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";

import { COLORS } from "@/lib/colors";
import { useAppStore } from "@/store/useAppStore";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Reading persisted state off disk is async, so on a cold start the store
  // briefly holds its defaults — including `hasSeenOnboarding: false`, which
  // the browse screen turns straight into a redirect. Rendering nothing until
  // rehydration lands is what stops a returning user being flung back into the
  // quiz for a frame.
  const [hydrated, setHydrated] = useState(() => useAppStore.persist.hasHydrated());

  useEffect(() => {
    const unsubscribe = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    // Hydration can land between the initial read above and this subscription.
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    return unsubscribe;
  }, []);

  const ready = fontsLoaded && hydrated;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Every screen renders text through the loaded fonts (see components/Text)
  // — nothing should paint with the system font while they're in flight.
  if (!ready) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", color: COLORS.ink },
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.accentText,
          contentStyle: { backgroundColor: COLORS.canvas },
          // Chevron only. Without this iOS labels the back button with the
          // previous route's title, which for a route group is the raw group
          // name — the product screen's back button read "(tabs)".
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        {/* Titled as a fallback for anything that ignores the display mode. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Skintel" }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="product/[id]" options={{ title: "Product" }} />
      </Stack>
    </>
  );
}
