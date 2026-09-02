import "../global.css";

import {
  PlayfairDisplay_500Medium,
  PlayfairDisplay_600SemiBold,
  useFonts,
} from "@expo-google-fonts/playfair-display";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";

import { COLORS } from "@/lib/colors";
import { useAppStore } from "@/store/useAppStore";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Body text no longer loads a custom font — it renders in the OS system
  // font (see tailwind.config.js's `sans` family), so only the display face
  // blocks startup now. This also means `ready` below settles faster on a
  // cold start than it used to, since there's one font family to wait on
  // instead of five.
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
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
          // fontFamily is deliberately unset: the OS UI font is what the
          // design asks for, and every platform renders it when nothing is
          // named. Weight is carried by fontWeight, same as the `font-semibold`
          // utilities elsewhere. See components/Text.tsx for why naming it
          // (as `System`) was actively wrong.
          headerTitleStyle: { fontWeight: "600", color: COLORS.ink },
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
        {/*
          No native header on any of these. The design draws its own top row on
          every pushed screen — back chevron on the canvas, screen-specific
          actions on the right — and a system header above that was rendering a
          second, competing title bar. `components/ScreenHeader` is that row.
        */}
        <Stack.Screen name="product/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="result/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="ingredients/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="ingredient/[inci]" options={{ headerShown: false }} />
        <Stack.Screen name="check" options={{ headerShown: false }} />
        <Stack.Screen
          name="scan-label"
          options={{ title: "Read the label", presentation: "modal" }}
        />
      </Stack>
    </>
  );
}
