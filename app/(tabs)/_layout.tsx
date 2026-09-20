import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useEffect, useRef } from "react";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, View, type GestureResponderEvent } from "react-native";

import { NotchedTabBarBackground } from "@/components/NotchedTabBarBackground";
import { TERRACOTTA } from "@/components/shell/shared";
import { genie } from "@/lib/genie";
import { SCAN_BUTTON, SCAN_BUTTON_LIFT, TAB_BAR_HEIGHT, TAB_BAR_SIDE_MARGIN, tabBarBottom } from "@/lib/tab-bar";
import { RAISED_SHADOW, SELECTED, SURFACE, TAB_INACTIVE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// Outline when unselected, filled when selected — the shape changes as well as
// the colour, so the current tab does not rest on a contrast difference alone.
// All four come from the one icon set, so their stroke weight matches; unselected
// they share a single muted colour and nothing else.
const TAB_ICONS = {
  home: { on: "home", off: "home-outline" },
  browse: { on: "search", off: "search-outline" },
  saved: { on: "heart", off: "heart-outline" },
  profile: { on: "person", off: "person-outline" },
} as const;

// The pill behind the current tab's icon.
const PILL_WIDTH = 46;
const PILL_HEIGHT = 36;
const PILL_RADIUS = 14;
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
    shown.value = withTiming(focused ? 1 : 0, { duration: PILL_MS, easing: Easing.out(Easing.cubic) });
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
          // Transparent: the bar is drawn by NotchedTabBarBackground, with its bite
          // and its own shade.
          backgroundColor: "transparent",
          borderTopWidth: 0,
          paddingTop: 0,
          paddingBottom: 0,
          // The raised scan button rises out of the bar's top edge.
          overflow: "visible",
          elevation: 0,
        },
        tabBarBackground: () => <NotchedTabBarBackground />,
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
          tabBarButton: (props) => <TabButton tab="home" {...props} />,
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
          tabBarButton: (props) => <TabButton tab="browse" {...props} />,
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
