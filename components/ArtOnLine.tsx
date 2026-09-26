import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * How far below the top of the safe area an empty state's picture starts, on
 * every screen that has one: Saved, History, Ingredients, and Search before
 * typing and when nothing matches (owner). Set by the lowest of them: Saved
 * and Ingredients show "Saves stay on this phone" and a sign-in link above
 * the picture to a guest, which end about 175 below the safe area, so the
 * line sits just under them and every other screen pads down to it.
 */
const ART_LINE = 184;

/**
 * Puts its children's top on the one line every empty-state picture shares,
 * whatever is above it on the screen: it measures where it landed and pads
 * the difference. Hidden for the one frame before that is known, so nothing
 * is seen jumping into place.
 */
export function ArtOnLine({ children, remeasureOn }: { children: ReactNode; remeasureOn?: unknown }) {
  const insets = useSafeAreaInsets();
  const ref = useRef<View>(null);
  const [pad, setPad] = useState<number | null>(null);
  const measure = useCallback(() => {
    // The wrapper's own top: the padding is inside it, so it never moves this.
    ref.current?.measureInWindow((_x, y) => setPad(Math.max(0, insets.top + ART_LINE - y)));
  }, [insets.top]);
  // What sits above can change without this moving inside its parent (Saved's
  // guest line comes and goes with the tab), which fires no layout event here:
  // `remeasureOn` says when to look again.
  useLayoutEffect(measure, [measure, remeasureOn]);
  return (
    <View ref={ref} style={{ alignSelf: "stretch" }} onLayout={measure}>
      <View style={{ height: pad ?? 0 }} />
      <View style={{ opacity: pad === null ? 0 : 1 }}>{children}</View>
    </View>
  );
}
