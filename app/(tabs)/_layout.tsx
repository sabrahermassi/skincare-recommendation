import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";

import { CANVAS, INK, LINE, MUTED } from "@/lib/tokens";
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
        tabBarActiveTintColor: INK,
        tabBarInactiveTintColor: MUTED,
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
          title: "Scan a product",
          tabBarLabel: "Scan",
          // The bar draws icons only, so this is the name a screen reader
          // announces — kept on every tab for the same reason.
          tabBarAccessibilityLabel: "Scan",
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
          // Stays "for.me", and is not the in-app header it looks like.
          // `headerShown` is false for this whole group (see screenOptions
          // above), so no `title` here renders on screen at all — Browse draws
          // `AppHeader`, which is the heart mark, the script wordmark having
          // been retired everywhere in the UI.
          //
          // What `title` actually sets is the web document title: the browser
          // tab, the bookmark, the history entry. The app name is the right
          // thing there, and the reasoning that it should not be repeated
          // inside the app does not reach it.
          //
          // The siblings naming a place rather than the app ("Saved", "Scan a
          // product") is the real inconsistency, but the fix for that is to
          // give every tab both — "Saved · for.me" — not to strip the name off
          // the one screen that has it. Out of scope here.
          title: "for.me",
          tabBarLabel: "Browse",
          tabBarAccessibilityLabel: "Browse",
          // A list glyph, not a house. With labels hidden (see above) the
          // icon carries the whole meaning, and a house promises "back to the
          // start" — but the start route `/` is the scanner in the first
          // position, so the house sat in slot two pointing at a product
          // list. The two icons were telling the user the tab order was the
          // reverse of what it is.
          tabBarIcon: ({ color }) => <Ionicons name="list" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "Saved",
          tabBarLabel: "Saved",
          tabBarAccessibilityLabel: "Saved",
          tabBarIcon: ({ color }) => <Ionicons name="heart" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Your skin profile",
          tabBarLabel: "Profile",
          tabBarAccessibilityLabel: "Profile",
          tabBarIcon: ({ color }) => <Ionicons name="person" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
