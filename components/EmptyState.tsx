import { Image } from "expo-image";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@/components/Text";
import { DISPLAY_FONT, INK, MUTED, TYPE } from "@/lib/tokens";

/** The picture's widest (v7: 220, 280 for the larger scenes). */
const ART_WIDTH = 220;
// The block's side padding.
const SIDE = 32;

/**
 * An empty or "not found" state (v7): the picture, the title in the page
 * face, one line, and at most one 220pt button (`action`). Illustrations
 * appear only on Home and in states like this.
 */
export function EmptyState({
  art,
  aspect = 1,
  artWidth = ART_WIDTH,
  artFull = false,
  title,
  line,
  action,
}: {
  art: number;
  /** The picture's own width over height, so it isn't letterboxed. */
  aspect?: number;
  artWidth?: number;
  /** The picture as wide as the screen, edge to edge (owner: the routine's), instead of `artWidth`. */
  artFull?: boolean;
  title?: string;
  line: string;
  action?: ReactNode;
}) {
  return (
    <View style={{ alignItems: "center", paddingHorizontal: SIDE }}>
      <Image
        source={art}
        contentFit="contain"
        accessibilityLabel=""
        // Edge to edge, it steps out of this block's side padding; "contain" keeps the whole picture in view.
        style={artFull ? { alignSelf: "stretch", marginHorizontal: -SIDE, aspectRatio: aspect } : { width: "100%", maxWidth: artWidth, aspectRatio: aspect }}
      />
      {title ? (
        <Text accessibilityRole="header" style={{ marginTop: 8, textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
          {title}
        </Text>
      ) : null}
      <Text style={{ marginTop: 8, maxWidth: 300, textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>{line}</Text>
      {action ? <View style={{ marginTop: 24, alignItems: "center" }}>{action}</View> : null}
    </View>
  );
}
