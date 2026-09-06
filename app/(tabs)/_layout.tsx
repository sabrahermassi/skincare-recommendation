import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";

import { COLORS } from "@/lib/colors";
import { useAppStore } from "@/store/useAppStore";

export default function TabsLayout() {
  const hasSeenOnboarding = useAppStore((s) => s.hasSeenOnboarding);

  /*
    First run goes to onboarding. This gate used to live in the browse screen,
    which worked only while browse was the landing tab. Scanning is the front
    door now, so the gate has to sit above the whole group or a first-time user
    would open straight into a camera with no profile to judge against.

    Declarative rather than an effect: it cannot fire before the navigator
    mounts, and it cannot ping-pong. The root layout already waits for the
    persisted store to rehydrate, so this never sees a stale `false`.
  */
  if (!hasSeenOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      screenOptions={{
        /*
          Every screen in this group draws its own top bar — the design gives
          each one a different one (a wordmark on scan and browse, a centred
          title on saved, an avatar row on profile), and a native header on
          top of that was showing as a second, duplicate title. Each screen
          pads for the status bar itself using the safe-area inset.
        */
        headerShown: false,
        tabBarActiveTintColor: COLORS.accentText,
        tabBarInactiveTintColor: COLORS.inkFaint,
        tabBarLabelStyle: { fontWeight: "500", fontSize: 11 },
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.hairline,
          height: 64,
          paddingBottom: 10,
          paddingTop: 8,
        },
      }}
    >
      {/*
        The scanner is the index route, so `/` lands on it. That is what makes
        a returning user open into the camera rather than a product list — the
        MVP's returning-user flow is Open -> Scanner, and the initial URL on a
        cold start is always `/`. Setting `initialRouteName` alone would not do
        it: that anchors the back stack, it does not change which screen `/`
        resolves to.
      */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Scan a product",
          tabBarLabel: "Scan",
          // Was a raised centre FAB while browsing was the front door. Now
          // that scanning *is* the app and this is the first tab, a floating
          // circle in position one reads as a stray button rather than the
          // primary action.
          tabBarIcon: ({ color }) => <Ionicons name="camera" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Skintel",
          tabBarLabel: "Browse",
          tabBarIcon: ({ color }) => <Ionicons name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "Saved",
          tabBarLabel: "Saved",
          tabBarIcon: ({ color }) => <Ionicons name="heart" size={22} color={color} />,
        }}
      />
      {/*
        Compare keeps its route and stays reachable from the tray on the browse
        screen, but it isn't a destination — you get there by picking two
        products, and the tray is capped at two. `href: null` drops it from the
        bar without deleting the route, which is also how the design draws it:
        a pushed screen with a back chevron and a centred title.
      */}
      <Tabs.Screen name="compare" options={{ title: "Compare", href: null }} />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Your skin profile",
          tabBarLabel: "Profile",
          tabBarIcon: ({ color }) => <Ionicons name="person" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
