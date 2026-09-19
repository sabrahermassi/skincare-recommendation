import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { View, type ColorValue } from "react-native";

import { TERRACOTTA } from "@/components/shell/shared";
import { CANVAS, INK, LINE, SELECTED, TAB_INACTIVE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// Outline when unselected, filled when selected — the shape changes as well as
// the colour, so the current tab does not rest on a contrast difference alone.
const TAB_ICONS = {
  scan: { on: "camera", off: "camera-outline" },
  browse: { on: "search", off: "search-outline" },
  saved: { on: "heart", off: "heart-outline" },
  profile: { on: "person", off: "person-outline" },
} as const;

/**
 * A tab-bar icon. The selected one sits in the same peach pill with a
 * terracotta outline the selected chips and pills use elsewhere in the app.
 */
function TabIcon({ tab, focused, color }: { tab: keyof typeof TAB_ICONS; focused: boolean; color: ColorValue }) {
  return (
    <View
      style={{
        width: 60,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? SELECTED : "transparent",
        borderWidth: 1.5,
        borderColor: focused ? TERRACOTTA : "transparent",
      }}
    >
      <Ionicons name={focused ? TAB_ICONS[tab].on : TAB_ICONS[tab].off} size={25} color={color} />
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
          Icons only. The label row could not be made to render: measured at
          393x852, each label's element was 8px tall against a 15px line box
          with overflow:hidden, so every word was sliced through the middle.
          Nothing assigns that height — it is what the flex column leaves
          after the 22px icon — and tabBarLabelStyle never reaches the
          element (its computed lineHeight stays "normal" when set), so
          tabBarStyle.height, tabBarLabelStyle.lineHeight and
          tabBarItemStyle.height were each tried and each failed.

          Four icons at this size carry their own meaning, so dropping the
          text removes the defect rather than fighting it. The names move to
          tabBarAccessibilityLabel below: hiding a visible label must not
          also take away the name a screen reader announces.
        */
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: CANVAS,
          borderTopColor: LINE,
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
          title: "Scan a product · for.me",
          tabBarLabel: "Scan",
          // The bar draws icons only, so this is the name a screen reader
          // announces — kept on every tab for the same reason.
          tabBarAccessibilityLabel: "Scan",
          // Was a raised centre FAB while browsing was the front door. Now
          // that scanning *is* the app and this is the first tab, a floating
          // circle in position one reads as a stray button rather than the
          // primary action.
          tabBarIcon: ({ color, focused }) => <TabIcon tab="scan" focused={focused} color={color} />,
        }}
      />
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
          // A magnifier, not a house or a bare list. With labels hidden (see
          // above) the icon carries the whole meaning: a house promises "back
          // to the start" (the start route `/` is the scanner, in the first
          // position), and a list glyph reads as a menu or a to-do list. The
          // magnifier is the recognised symbol for browsing and it is what this
          // tab opens with — the search box.
          tabBarIcon: ({ color, focused }) => <TabIcon tab="browse" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "Saved · for.me",
          tabBarLabel: "Saved",
          tabBarAccessibilityLabel: "Saved",
          tabBarIcon: ({ color, focused }) => <TabIcon tab="saved" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Your skin profile · for.me",
          tabBarLabel: "Profile",
          tabBarAccessibilityLabel: "Profile",
          tabBarIcon: ({ color, focused }) => <TabIcon tab="profile" focused={focused} color={color} />,
        }}
      />
    </Tabs>
  );
}
