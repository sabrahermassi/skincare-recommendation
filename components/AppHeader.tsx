import type { ReactNode } from "react";
import { View } from "react-native";

import { Eyebrow, Wordmark } from "@/components/Wordmark";

/**
 * The masthead, identical on every tab that shows one.
 *
 * Scan and Browse each drew their own — different mark size, different wordmark
 * size, different colour, a mono strapline on one and none on the other — so
 * the top of the app resized and recoloured itself as you moved between tabs.
 * It is one component now and takes no size props: that is the point.
 *
 * No app-mark icon any more — just the wordmark and the strapline. The
 * bracket-and-dropper glyph (`components/LogoMark.tsx`) was the "SkinTell"
 * mark specifically and didn't carry over to Manassa; deleted rather than
 * recoloured, since nothing else referenced it.
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
        <Wordmark size={26} />
        <Eyebrow size={8.5} />
      </View>

      {right}
    </View>
  );
}
