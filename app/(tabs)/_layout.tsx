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
        headerStyle: { backgroundColor: COLORS.surface },
        headerTitleStyle: { fontFamily: "PlusJakartaSans_600SemiBold", color: COLORS.ink },
        tabBarActiveTintColor: COLORS.accentText,
        tabBarInactiveTintColor: COLORS.inkFaint,
        tabBarLabelStyle: { fontFamily: "PlusJakartaSans_500Medium", fontSize: 11 },
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.hairline,
          height: 64,
          paddingBottom: 10,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan a product",
          tabBarLabel: "Scan",
          // Was a raised centre FAB while browsing was the front door. Now
          // that scanning *is* the app and this is the first tab, a floating
          // circle in position one reads as a stray button rather than the
          // primary action.
          tabBarIcon: ({ color, size }) => <Ionicons name="camera" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Skintel",
          tabBarLabel: "Browse",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "Saved",
          tabBarLabel: "Saved",
          tabBarIcon: ({ color, size }) => <Ionicons name="heart" size={size} color={color} />,
        }}
      />
      {/*
        Compare keeps its route and stays reachable from the tray on the browse
        screen, but it isn't a destination — you get there by picking two
        products, and the tray is capped at two. `href: null` drops it from the
        bar without deleting the route.
      */}
      <Tabs.Screen name="compare" options={{ title: "Compare", href: null }} />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Your skin profile",
          tabBarLabel: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
