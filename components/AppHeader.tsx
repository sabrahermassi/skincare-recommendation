import type { ReactNode } from "react";
import { View } from "react-native";

import { HeartMark } from "@/components/icons/HeartMark";

/**
 * The masthead, identical on every tab that shows one.
 *
 * Scan and Browse each drew their own — different mark size, different wordmark
 * size, different colour, a mono strapline on one and none on the other — so
 * the top of the app resized and recoloured itself as you moved between tabs.
 * It is one component now and takes no size props: that is the point.
 *
 * Draws the heart mark, not the script wordmark — the redesign retired the
 * "for.me" script face everywhere in the app; every brand touchpoint (here,
 * the app icon) now uses the same `HeartMark` glyph instead.
 * `components/Wordmark.tsx` (the script face at masthead scale) is deleted,
 * not left orphaned — this was its only caller.
 *
 * No app-mark icon any more beyond the heart. The bracket-and-dropper glyph
 * (`components/LogoMark.tsx`) was an earlier brand's mark specifically and
 * didn't carry over; deleted rather than recoloured, since nothing else
 * referenced it. The "SCAN · ANALYZE · KNOW" strapline (`Eyebrow`, formerly
 * exported alongside `Wordmark`) is gone the same way, per explicit request
 * — deleted rather than left unused.
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
      <HeartMark size={26} variant="outline" strokeWidth={1.8} />

      {right}
    </View>
  );
}
