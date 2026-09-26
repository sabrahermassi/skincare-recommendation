import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useEffect } from "react";
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, View, type GestureResponderEvent } from "react-native";

import { TabBarBackground } from "@/components/TabBarBackground";
import { TERRACOTTA } from "@/components/shell/shared";
import { openScanner } from "@/lib/open-scanner";
import { SCAN_BUTTON, SCAN_BUTTON_LIFT, SCAN_ICON, TAB_BAR_HEIGHT, TAB_BAR_SIDE_MARGIN, tabBarBottom } from "@/lib/tab-bar";
import { RAISED_SHADOW, SELECTED, SURFACE, TAB_INACTIVE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";
import { haptic } from "@/lib/haptics";

// Outline when unselected, filled when selected — the shape changes as well as
// the colour, so the current tab does not rest on a contrast difference alone.
// All four come from the one icon set, so their stroke weight matches; unselected
// they share a single muted colour and nothing else.
const TAB_ICONS = {
  home: { on: "home", off: "home-outline" },
  school: { on: "school", off: "school-outline" },
  saved: { on: "heart", off: "heart-outline" },
  profile: { on: "person", off: "person-outline" },
} as const;

// The pill behind the current tab's icon.
const PILL_WIDTH = 44;
const PILL_HEIGHT = 44;
const PILL_RADIUS = 12;
const PILL_MS = 200;
const PILL_FROM_SCALE = 0.85;

/**
 * A tab: the icon only, in a button of its own that is exactly as tall as the bar
 * and centres the icon in it. The navigator's own item pads and aligns its
 * contents differently on each platform, which is what left the icons off-centre;
 * drawing the button here removes the difference. Unselected the icon is an
 * outline in the shared muted colour, with nothing drawn around it; selected it
 * is filled in terracotta on a peach pill that fades in.
 * Names are not drawn — they did not render on a phone (see `tabBarShowLabel`) —
 * and live on the button's accessibility label for a screen reader.
 */
function TabButton({
  tab,
  onPress,
  ...rest
}: {
  tab: keyof typeof TAB_ICONS;
  onPress?: ((event: GestureResponderEvent) => void) | null;
  "aria-selected"?: boolean;
  "aria-label"?: string;
  testID?: string;
}) {
  const focused = rest["aria-selected"] === true;
  const color = focused ? TERRACOTTA : TAB_INACTIVE;
  const shown = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    // ReduceMotion.System: no grow with Reduce Motion on (#313).
    shown.value = withTiming(focused ? 1 : 0, { duration: PILL_MS, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System });
  }, [focused, shown]);
  const pillStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: PILL_FROM_SCALE + (1 - PILL_FROM_SCALE) * shown.value }],
  }));
  return (
    <Pressable
      onPress={onPress ?? undefined}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={rest["aria-label"]}
      testID={rest.testID}
      style={{ flex: 1, height: TAB_BAR_HEIGHT, alignItems: "center", justifyContent: "center" }}
    >
      <View style={{ width: PILL_WIDTH, height: PILL_HEIGHT, alignItems: "center", justifyContent: "center" }}>
        {/* The pill behind the current tab's icon: fades and grows in when the tab
            becomes current, and back out when it stops. Driven by `focused`, so
            switching tabs quickly just retargets it. */}
        <Animated.View
          pointerEvents="none"
          style={[
            { position: "absolute", width: PILL_WIDTH, height: PILL_HEIGHT, borderRadius: PILL_RADIUS, backgroundColor: SELECTED },
            pillStyle,
          ]}
        />
        <Ionicons name={focused ? TAB_ICONS[tab].on : TAB_ICONS[tab].off} size={29} color={color} />
      </View>
    </Pressable>
  );
}

/**
 * The scanner, raised out of the middle of the bar. The ring in the canvas
 * colour cuts it out of the bar's top edge. Pressing it opens the scanner as a
 * full-screen modal that slides up over the tabs (#313) — it is not a tab.
 */
function ScanTabButton() {
  return (
    <View pointerEvents="box-none" style={{ flex: 1, alignItems: "center" }}>
      <Pressable
        onPress={() => {
          haptic.tap();
          openScanner();
        }}
        // A button, not a tab: it opens the scanner over the tabs (#313).
        accessibilityRole="button"
        accessibilityLabel="Scan"
        style={{
          position: "absolute",
          top: -SCAN_BUTTON_LIFT,
          width: SCAN_BUTTON,
          height: SCAN_BUTTON,
          borderRadius: SCAN_BUTTON / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: TERRACOTTA,
          ...RAISED_SHADOW,
        }}
        className="active:opacity-90"
      >
        <Ionicons name="camera" size={SCAN_ICON} color={SURFACE} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const hasSeenOnboarding = useAppStore((s) => s.hasSeenOnboarding);
  const insets = useSafeAreaInsets();

  /*
    First run goes to the intro screens, which hand off to Home (the skin
    quiz waits until someone asks for a personal match, #346). This gate used
    to live in the browse screen, which worked only while browse was the
    landing tab; it sits above the whole group so no tab opens first.

    Declarative rather than an effect: it cannot fire before the navigator
    mounts, and it cannot ping-pong. The root layout already waits for the
    persisted store to rehydrate, so this never sees a stale `false`.
  */
  if (!hasSeenOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        /*
          Every screen in this group draws its own top bar — the design gives
          each one a different one (a wordmark on scan and browse, a centred
          title on saved, an avatar row on profile), and a native header on
          top of that was showing as a second, duplicate title. Each screen
          pads for the status bar itself using the safe-area inset.
        */
        headerShown: false,
        /*
          Icons only. The label row could not be made to render: measured at
          393x852, each label's element was 8px tall against a 15px line box
          with overflow:hidden, so every word was sliced through the middle, and
          tabBarLabelStyle never reaches the element. Drawing the names in the
          tab itself worked in a browser and did not show on a phone. The names
          live on tabBarAccessibilityLabel below, which is what a screen reader
          announces.
        */
        tabBarShowLabel: false,
        // A pill lying on top of the screen, clear of its edges, with a soft
        // shade under it. Screens scroll behind it, so each one leaves room at
        // its end (tabBarClearance).
        tabBarStyle: {
          position: "absolute",
          // Full width, with the side gap as padding: the bar's body is drawn
          // inset by the same amount, so the gap holds whether or not the
          // navigator honours left/right on a device.
          left: 0,
          right: 0,
          paddingHorizontal: TAB_BAR_SIDE_MARGIN,
          bottom: tabBarBottom(insets.bottom),
          height: TAB_BAR_HEIGHT,
          // Transparent: the bar is drawn by TabBarBackground, with its own shade.
          backgroundColor: "transparent",
          borderTopWidth: 0,
          paddingTop: 0,
          paddingBottom: 0,
          // The raised scan button rises out of the bar's top edge.
          overflow: "visible",
          elevation: 0,
        },
        tabBarBackground: () => <TabBarBackground />,
      }}
    >
      {/*
        Home is the index route, so `/` lands on it — and so does finishing the
        intro: the first screen after it is Home, with the scan card, the search
        box and the skin profile. Setting `initialRouteName` alone would not do
        it: that anchors the back stack, it does not change which screen `/`
        resolves to.
      */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Home · for.me",
          tabBarLabel: "Home",
          tabBarAccessibilityLabel: "Home",
          tabBarButton: (props) => <TabButton tab="home" {...props} />,
        }}
      />
      {/*
        Skincare School, in the place Browse had. Browse is still a screen in this
        group (declared last, below) but has no button in the bar: it opens from
        Home's "Find skincare" card and from the links that ask for a search.
      */}
      <Tabs.Screen
        name="school"
        options={{
          title: "Skincare School · for.me",
          tabBarLabel: "Skincare School",
          tabBarAccessibilityLabel: "Skincare School",
          // A mortarboard, the same one Profile's "Skincare School" row uses.
          tabBarButton: (props) => <TabButton tab="school" {...props} />,
        }}
      />
      {/*
        The raised middle button. The scanner itself is a full-screen modal on
        the root stack (app/scanner.tsx), not a tab; this placeholder route
        only holds the button's place in the bar, which is the order of the
        screens here. The button opens the modal directly and never selects
        this tab.
      */}
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan a product · for.me",
          tabBarLabel: "Scan",
          // The bar draws icons only, so this is the name a screen reader
          // announces — kept on every tab for the same reason.
          tabBarAccessibilityLabel: "Scan",
          tabBarButton: () => <ScanTabButton />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "Saved · for.me",
          tabBarLabel: "Saved",
          tabBarAccessibilityLabel: "Saved",
          tabBarButton: (props) => <TabButton tab="saved" {...props} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Your skin profile · for.me",
          tabBarLabel: "Profile",
          tabBarAccessibilityLabel: "Profile",
          tabBarButton: (props) => <TabButton tab="profile" {...props} />,
        }}
      />
      {/*
        Browse: a screen in the group without a button in the bar (`href: null`).
        Reached from Home's "Find skincare" card and every "search instead" link;
        the bar stays under it, so Home is one tap away. `title` is the web
        document title only (headerShown is false for this group).
      */}
      <Tabs.Screen
        name="browse"
        options={{
          title: "for.me",
          href: null,
        }}
      />
    </Tabs>
  );
}
