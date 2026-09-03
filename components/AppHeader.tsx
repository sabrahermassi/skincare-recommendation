import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Avatar } from "@/components/Avatar";
import { LogoMark } from "@/components/LogoMark";
import { Text } from "@/components/Text";
import { Eyebrow, Wordmark } from "@/components/Wordmark";

/**
 * The masthead, identical on every tab that shows one.
 *
 * Scan and Browse each drew their own — different mark size, different wordmark
 * size, different colour, a mono strapline on one and none on the other — so
 * the top of the app resized and recoloured itself as you moved between tabs.
 * It is one component now and takes no size props: that is the point.
 *
 * The gutter matches the content below it (26pt, the scanner's camera card),
 * so nothing in the header hangs off the edge of the screen.
 */
export const HEADER_GUTTER = 26;

export function AppHeader({ right }: { right?: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        paddingHorizontal: HEADER_GUTTER,
        paddingTop: 12,
        paddingBottom: 14,
      }}
    >
      <View style={{ gap: 7, flexShrink: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <LogoMark size={30} />
          <Wordmark size={26} />
        </View>
        <Eyebrow size={8.5} />
      </View>

      {right}
    </View>
  );
}

/**
 * The profile pill on the right of the masthead. It shrinks and its text column
 * flexes, so a long profile summary wraps inside the pill instead of pushing it
 * off the screen.
 */
export function ProfilePill({ summary }: { summary: string }) {
  return (
    <Pressable
      onPress={() => router.push("/profile")}
      accessibilityRole="button"
      accessibilityLabel="Your skin profile"
      style={{
        height: 52,
        flexShrink: 1,
        maxWidth: 186,
        paddingHorizontal: 10,
        gap: 9,
        flexDirection: "row",
        alignItems: "center",
      }}
      className="rounded-full bg-tint-lilac"
    >
      <Avatar size={30} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          className="font-semibold text-[#736C7F]"
          style={{ fontSize: 7.5, letterSpacing: 0.98 }}
          numberOfLines={1}
        >
          YOUR SKIN PROFILE
        </Text>
        <Text
          className="text-[#413B4B]"
          style={{ fontSize: 9.5, lineHeight: 12.5 }}
          numberOfLines={2}
        >
          {summary || "No profile yet - tap to start"}
        </Text>
      </View>
      <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
        <Path
          d="m9 5 7 7-7 7"
          stroke="#5C5566"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}
