import { Image } from "expo-image";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@/components/Text";
import { noOrphan } from "@/lib/text";
import { DISPLAY_FONT, INK, MUTED, SPACE, TYPE, LEADING, TRACKING } from "@/lib/tokens";

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
  artShift = 0,
  title,
  line,
  action,
}: {
  art: number;
  /** The picture's own width over height, so it isn't letterboxed. */
  aspect?: number;
  artWidth?: number;
  /** The picture as wide as the screen less the page gutter each side (owner: the routine's), instead of `artWidth`. */
  artFull?: boolean;
  /** Points to move the picture sideways (negative is left), for one whose drawing sits off the middle of its own canvas. */
  artShift?: number;
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
        // Full width, it steps out of this block's side padding to the page
        // gutter, so the drawing never touches the screen's edge; "contain"
        // keeps the whole picture in view.
        style={[
          artFull ? { alignSelf: "stretch", marginHorizontal: SPACE.gutter - SIDE, aspectRatio: aspect } : { width: "100%", maxWidth: artWidth, aspectRatio: aspect },
          artShift ? { transform: [{ translateX: artShift }] } : null,
        ]}
      />
      {title ? (
        <Text accessibilityRole="header" style={{ marginTop: artFull ? SPACE.gutter : 8, textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: LEADING.heading, letterSpacing: TRACKING.heading, color: INK }}>
          {noOrphan(title)}
        </Text>
      ) : null}
      <Text style={{ marginTop: SPACE.text, maxWidth: 300, textAlign: "center", fontSize: TYPE.body, lineHeight: LEADING.body, color: MUTED }}>{noOrphan(line)}</Text>
      {action ? <View style={{ marginTop: SPACE.section, alignItems: "center" }}>{action}</View> : null}
    </View>
  );
}
