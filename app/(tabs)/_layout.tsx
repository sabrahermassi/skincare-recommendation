import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { View } from "react-native";

import { COLORS } from "@/lib/colors";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTitleStyle: { fontFamily: "Inter_600SemiBold", color: COLORS.ink },
        tabBarActiveTintColor: COLORS.accentText,
        tabBarInactiveTintColor: COLORS.inkFaint,
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 11 },
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
        name="index"
        options={{
          title: "Skintel",
          tabBarLabel: "Home",
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
        name="scan"
        options={{
          title: "Scan",
          // Empty label + a raised circular icon reads as the primary action,
          // not just another tab — the recipe is a negative marginTop pulling
          // the icon above the bar.
          tabBarLabel: "",
          tabBarIcon: () => (
            <View
              className="items-center justify-center rounded-full bg-accent"
              style={{
                width: 52,
                height: 52,
                marginBottom: 26,
                shadowColor: COLORS.ink,
                shadowOpacity: 0.24,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 3 },
                elevation: 4,
              }}
            >
              <Ionicons name="camera" size={24} color="#fff" />
            </View>
          ),
        }}
      />
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
