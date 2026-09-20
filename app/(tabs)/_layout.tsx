import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, View, type ColorValue, type GestureResponderEvent } from "react-native";

import { SearchIcon } from "@/components/icons/SearchIcon";
import { TERRACOTTA } from "@/components/shell/shared";
import { genie } from "@/lib/genie";
import { SCAN_BUTTON, SCAN_BUTTON_LIFT, TAB_BAR_HEIGHT, TAB_BAR_SIDE_MARGIN, tabBarBottom } from "@/lib/tab-bar";
import { FLOATING_SHADOW, INK, RAISED_SHADOW, SURFACE, TAB_INACTIVE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// Outline when unselected, filled when selected — the shape changes as well as
// the colour, so the current tab does not rest on a contrast difference alone.
// Search is the exception: its own drawn magnifier (components/icons/SearchIcon),
// with the lens filled when selected.
const TAB_ICONS = {
  home: { on: "compass", off: "compass-outline" },
  saved: { on: "heart", off: "heart-outline" },
  profile: { on: "person-circle", off: "person-circle-outline" },
} as const;

/**
 * A tab: the icon only. Unselected it is an outline; selected it is filled in
 * terracotta, with nothing drawn around it. Names are not drawn — they did not
 * render on a phone (see `tabBarShowLabel`) — and live on
 * tabBarAccessibilityLabel for a screen reader.
 */
function TabItem({
  tab,
  focused,
  color,
}: {
  tab: keyof typeof TAB_ICONS | "browse";
  focused: boolean;
  color: ColorValue;
}) {
  return (
    <View style={{ width: 60, height: 36, alignItems: "center", justifyContent: "center" }}>
      {tab === "browse" ? (
        <SearchIcon size={27} color={String(focused ? TERRACOTTA : color)} filled={focused} />
      ) : (
        <Ionicons name={focused ? TAB_ICONS[tab].on : TAB_ICONS[tab].off} size={29} color={focused ? TERRACOTTA : color} />
      )}
    </View>
  );
}

/**
 * The scanner, raised out of the middle of the bar. The ring in the canvas
 * colour cuts it out of the bar's top edge. Pressing it opens the scanner full
 * screen (and the bar goes away): it notes where the button is so the scanner
 * can grow out of that spot, and fold back into it when closed.
 */
function ScanTabButton({ onPress }: { onPress?: (event: GestureResponderEvent) => void }) {
  const button = useRef<View>(null);

  function open(event: GestureResponderEvent) {
    const go = () => {
      genie.opening = true;
      onPress?.(event);
    };
    if (!button.current) {
      go();
      return;
    }
    button.current.measureInWindow((x, y, width, height) => {
      if (width > 0) genie.origin = { x: x + width / 2, y: y + height / 2 };
      go();
    });
  }

  return (
    <View pointerEvents="box-none" style={{ flex: 1, alignItems: "center" }}>
      <Pressable
        ref={button}
        onPress={open}
        accessibilityRole="tab"
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
          borderWidth: 5,
          // The bar's own colour, so the ring cuts the button out of it.
          borderColor: SURFACE,
          ...RAISED_SHADOW,
        }}
        className="active:opacity-90"
      >
        <Ionicons name="camera" size={28} color={SURFACE} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const hasSeenOnboarding = useAppStore((s) => s.hasSeenOnboarding);
  const insets = useSafeAreaInsets();

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
      // Back from the scanner's X goes to the tab you came from.
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
        tabBarActiveTintColor: INK,
        tabBarInactiveTintColor: TAB_INACTIVE,
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
          left: TAB_BAR_SIDE_MARGIN,
          right: TAB_BAR_SIDE_MARGIN,
          bottom: tabBarBottom(insets.bottom),
          height: TAB_BAR_HEIGHT,
          borderRadius: TAB_BAR_HEIGHT / 2,
          backgroundColor: SURFACE,
          borderTopWidth: 0,
          paddingTop: 0,
          paddingBottom: 0,
          // The raised scan button rises out of the bar's top edge.
          overflow: "visible",
          ...FLOATING_SHADOW,
        },
      }}
    >
      {/*
        Home is the index route, so `/` lands on it — and so does finishing the
        quiz: the first screen after it is Home, with the scan card, the search
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
          tabBarIcon: ({ color, focused }) => <TabItem tab="home" focused={focused} color={color} />,
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
          tabBarLabel: "Search",
          tabBarAccessibilityLabel: "Search",
          // A magnifier, not a house or a bare list: a house promises "back to
          // the start" (the start route `/` is the scanner), and a list glyph
          // reads as a menu or a to-do list. The magnifier is the recognised
          // symbol for browsing and it is what this tab opens with — the
          // search box.
          tabBarIcon: ({ color, focused }) => <TabItem tab="browse" focused={focused} color={color} />,
        }}
      />
      {/*
        The scanner: full screen, opened by the raised middle button (or a scan
        card on Home). Its place in the bar is that button; the order of the
        screens here is the order of the bar.
      */}
      <Tabs.Screen
        name="scanner"
        options={{
          title: "Scan a product · for.me",
          tabBarLabel: "Scan",
          // The bar draws icons only, so this is the name a screen reader
          // announces — kept on every tab for the same reason.
          tabBarAccessibilityLabel: "Scan",
          // The scanner is full screen: no tab bar over it.
          tabBarStyle: { display: "none" },
          tabBarButton: (props) => <ScanTabButton onPress={props.onPress ?? undefined} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "Saved · for.me",
          tabBarLabel: "Saved",
          tabBarAccessibilityLabel: "Saved",
          tabBarIcon: ({ color, focused }) => <TabItem tab="saved" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Your skin profile · for.me",
          tabBarLabel: "Profile",
          tabBarAccessibilityLabel: "Profile",
          tabBarIcon: ({ color, focused }) => <TabItem tab="profile" focused={focused} color={color} />,
        }}
      />
    </Tabs>
  );
}
