import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs, usePathname } from "expo-router";
import { Pressable, View, type ColorValue, type GestureResponderEvent } from "react-native";

import { TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import { SCAN_BUTTON, SCAN_BUTTON_LIFT } from "@/lib/tab-bar";
import { CANVAS, CTA, INK, LINE, SELECTED, TAB_INACTIVE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// Outline when unselected, filled when selected — the shape changes as well as
// the colour, so the current tab does not rest on a contrast difference alone.
const TAB_ICONS = {
  browse: { on: "search", off: "search-outline" },
  skinHelper: { on: "sparkles", off: "sparkles-outline" },
  saved: { on: "heart", off: "heart-outline" },
  profile: { on: "person", off: "person-outline" },
} as const;

/**
 * A tab: the icon, with the selected one in the same peach pill and terracotta
 * outline the selected chips and pills use elsewhere in the app, and its name
 * underneath. The name is drawn here rather than through the navigator's own
 * label — that one was measured clipped to 8px tall (see \`tabBarShowLabel\`).
 */
function TabItem({
  tab,
  label,
  focused,
  color,
}: {
  tab: keyof typeof TAB_ICONS;
  label: string;
  focused: boolean;
  color: ColorValue;
}) {
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <View
        style={{
          width: 60,
          height: 32,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: focused ? SELECTED : "transparent",
          borderWidth: 1.5,
          borderColor: focused ? TERRACOTTA : "transparent",
        }}
      >
        <Ionicons name={focused ? TAB_ICONS[tab].on : TAB_ICONS[tab].off} size={24} color={color} />
      </View>
      <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: focused ? "700" : "500", color }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The scanner, raised out of the middle of the bar. The ring in the canvas
 * colour cuts it out of the bar's top edge; it fills terracotta while the
 * scanner is the open tab.
 */
function ScanTabButton({ onPress }: { onPress?: (event: GestureResponderEvent) => void }) {
  // The scanner is the index route, `/`. Read from the path rather than from the
  // button's own props, which do not say whether this tab is the selected one.
  const focused = usePathname() === "/";
  return (
    <View pointerEvents="box-none" style={{ flex: 1, alignItems: "center" }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityLabel="Scan"
        accessibilityState={{ selected: focused }}
        style={{
          position: "absolute",
          top: -SCAN_BUTTON_LIFT,
          width: SCAN_BUTTON,
          height: SCAN_BUTTON,
          borderRadius: SCAN_BUTTON / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: focused ? TERRACOTTA : CTA,
          borderWidth: 5,
          borderColor: CANVAS,
        }}
        className="active:opacity-90"
      >
        <Ionicons name={focused ? "camera" : "camera-outline"} size={28} color={focused ? CANVAS : INK} />
      </Pressable>
    </View>
  );
}

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
        tabBarActiveTintColor: INK,
        tabBarInactiveTintColor: TAB_INACTIVE,
        /*
          The navigator's own label row is off. It could not be made to render:
          measured at 393x852, each label's element was 8px tall against a 15px
          line box with overflow:hidden, so every word was sliced through the
          middle, and tabBarLabelStyle never reaches the element. \`TabItem\`
          draws the names itself instead. They are also on
          tabBarAccessibilityLabel below, which is what a screen reader
          announces.
        */
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: CANVAS,
          borderTopColor: LINE,
          height: 76,
          paddingBottom: 10,
          paddingTop: 6,
          // The raised scan button rises out of the bar's top edge.
          overflow: "visible",
        },
      }}
    >
      <Tabs.Screen
        name="browse"
        options={{
          // Stays "for.me", and is not the in-app header it looks like.
          // `headerShown` is false for this whole group (see screenOptions
          // above), so no `title` here renders on screen at all — Browse draws
          // `AppHeader`, which is the heart mark, the script wordmark having
          // been retired everywhere in the UI.
          //
          // What `title` actually sets is the web document title: the browser
          // tab, the bookmark, the history entry. The app name is the right
          // thing there, and the reasoning that it should not be repeated
          // inside the app does not reach it. This one already carries the
          // app name, so unlike its siblings it needs no "· for.me" suffix.
          title: "for.me",
          tabBarLabel: "Browse",
          tabBarAccessibilityLabel: "Browse",
          // A magnifier, not a house or a bare list: a house promises "back to
          // the start" (the start route `/` is the scanner), and a list glyph
          // reads as a menu or a to-do list. The magnifier is the recognised
          // symbol for browsing and it is what this tab opens with — the
          // search box.
          tabBarIcon: ({ color, focused }) => <TabItem tab="browse" label="Browse" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="skin-helper"
        options={{
          title: "Skin helper · for.me",
          tabBarLabel: "Skin helper",
          tabBarAccessibilityLabel: "Skin helper",
          tabBarIcon: ({ color, focused }) => (
            <TabItem tab="skinHelper" label="Skin helper" focused={focused} color={color} />
          ),
        }}
      />
      {/*
        The scanner is the index route, so `/` lands on it. That is what makes
        a returning user open into the camera rather than a product list — the
        MVP's returning-user flow is Open -> Scanner, and the initial URL on a
        cold start is always `/`. Setting `initialRouteName` alone would not do
        it: that anchors the back stack, it does not change which screen `/`
        resolves to. Its place in the bar is the raised middle button; the order
        of the screens here is the order of the bar.
      */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Scan a product · for.me",
          tabBarLabel: "Scan",
          // The bar draws icons only, so this is the name a screen reader
          // announces — kept on every tab for the same reason.
          tabBarAccessibilityLabel: "Scan",
          tabBarButton: (props) => <ScanTabButton onPress={props.onPress ?? undefined} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "Saved · for.me",
          tabBarLabel: "Saved",
          tabBarAccessibilityLabel: "Saved",
          tabBarIcon: ({ color, focused }) => <TabItem tab="saved" label="Saved" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Your skin profile · for.me",
          tabBarLabel: "Profile",
          tabBarAccessibilityLabel: "Profile",
          tabBarIcon: ({ color, focused }) => <TabItem tab="profile" label="Profile" focused={focused} color={color} />,
        }}
      />
    </Tabs>
  );
}
