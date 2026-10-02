import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, View, type GestureResponderEvent } from "react-native";

import { activeTabSlot, PILL_HEIGHT, PILL_WIDTH, TabBarBackground } from "@/components/TabBarBackground";
import { Text } from "@/components/Text";
import { openScanner } from "@/lib/open-scanner";
import { SCAN_BUTTON, SCAN_BUTTON_LIFT, SCAN_ICON, TAB_BAR_HEIGHT, TAB_BAR_SIDE_MARGIN, tabBarBottom } from "@/lib/tab-bar";
import { BUTTON, LINK, RAISED_SHADOW, TAB_INACTIVE, WHITE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";
import { haptic } from "@/lib/haptics";

// Outline when unselected, filled when selected — the shape changes as well as
// the colour, so the current tab does not rest on a contrast difference alone.
// All four come from the one icon set, so their stroke weight matches; unselected
// they share a single muted colour and nothing else.
// `slot` is the tab's place among the bar's five (the scan button is the third).
const TAB_ICONS = {
  home: { on: "home", off: "home-outline", label: "Home", slot: 0 },
  school: { on: "school", off: "school-outline", label: "School", slot: 1 },
  saved: { on: "heart", off: "heart-outline", label: "Saved", slot: 3 },
  profile: { on: "person", off: "person-outline", label: "Profile", slot: 4 },
} as const;

// A tab's icon and its name, sized for the bar (v9, read off the hand-off: a
// 22pt icon, an 11pt name). The pill behind the current one is drawn once, by
// `TabBarBackground`, and flows from tab to tab.
const TAB_ICON = 22;
const TAB_LABEL = 11;

/**
 * A tab: its icon over its name (v9), in a button of its own that is exactly as tall as the bar
 * and centres the icon in it. The navigator's own item pads and aligns its
 * contents differently on each platform, which is what left the icons off-centre;
 * drawing the button here removes the difference. Unselected the icon is an
 * outline in the shared muted colour, with nothing drawn around it; selected it
 * is filled in sage, on the pale sage pill that flows to it.
 * The name is drawn here, under the icon, not by the navigator: its own label
 * row could not be made to render (see `tabBarShowLabel`). A screen reader
 * gets the full name from the button's accessibility label.
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
  const color = focused ? LINK : TAB_INACTIVE;
  const slot = TAB_ICONS[tab].slot;
  useEffect(() => {
    if (focused) activeTabSlot.value = slot;
  }, [focused, slot]);
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
        <Ionicons name={focused ? TAB_ICONS[tab].on : TAB_ICONS[tab].off} size={TAB_ICON} color={color} />
        <Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ marginTop: 1, fontSize: TAB_LABEL, lineHeight: 13, fontWeight: "600", color }}>
          {TAB_ICONS[tab].label}
        </Text>
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
          backgroundColor: BUTTON.primary.fill,
          ...RAISED_SHADOW,
        }}
        className="active:opacity-90"
      >
        <Ionicons name="camera" size={SCAN_ICON} color={WHITE} />
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
      {/* Skincare School, second in the bar. */}
      <Tabs.Screen
        name="school"
        options={{
          title: "Skincare School · for.me",
          tabBarLabel: "Skincare School",
          tabBarAccessibilityLabel: "Skincare School",
          // A mortarboard.
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
    </Tabs>
  );
}
