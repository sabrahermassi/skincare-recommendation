import "../global.css";

import { CormorantGaramond_500Medium } from "@expo-google-fonts/cormorant-garamond";
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import { Montserrat_300Light, Montserrat_400Regular } from "@expo-google-fonts/montserrat";
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
import { warmCatalogue } from "@/data/api";
import { useAppStore } from "@/store/useAppStore";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Body text no longer loads a custom font — it renders in the OS system
  // font (see tailwind.config.js's `sans` family), so only the display and
  // mono faces block startup now. IBM Plex Mono is the Ellow Welcome
  // screen's tagline face (design_handoff_ellow_welcome) — a signature of
  // the system per that handoff, not a fallback, so it earns its own load
  // rather than rendering in the UI font while it's briefly missing.
  //
  // The Cormorant Garamond / Montserrat pair is the FOR.ME onboarding
  // reskin (design-watercolor/FOR_ME_Onboarding_Design_Spec.md) — loaded
  // here for the same reason: onboarding is the first thing a new install
  // renders, so its fonts can't be missing on first paint either.
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
    IBMPlexMono_500Medium,
    CormorantGaramond_500Medium,
    Montserrat_300Light,
    Montserrat_400Regular,
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

  // Same reasoning as the hydration gate above, for the catalogue: reading it
  // off disk is async, so without this the browse screen paints a skeleton and
  // swaps in the cached list a tick later. Doing it here spends that time on a
  // splash the user is already looking at. It cannot fail the launch — a cache
  // miss resolves like a hit and the screen falls back to fetching.
  const [catalogueWarm, setCatalogueWarm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    warmCatalogue().finally(() => {
      if (!cancelled) setCatalogueWarm(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = fontsLoaded && hydrated && catalogueWarm;

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
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "for.me" }} />
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
        <Stack.Screen
          name="scan-label"
          options={{ title: "Read the label", presentation: "modal" }}
        />
      </Stack>
    </>
  );
}
