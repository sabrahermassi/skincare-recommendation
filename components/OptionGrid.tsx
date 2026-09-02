import { Children, type ReactNode } from "react";
import { View } from "react-native";

/**
 * Two equal columns with real gutters, laid out with inline styles.
 *
 * Every screen that needed this was writing `<View className="w-[48.5%]">`
 * inside a `flex-row flex-wrap gap-2`. When those bracketed utilities don't
 * reach the running stylesheet the wrapper loses its width, the card's inner
 * `flex-1` label collapses to zero, and a grid of options renders as a row of
 * empty boxes with no space between them — which is exactly how the concerns
 * step and the profile screen's skin-type and concern grids were turning up.
 *
 * Widths come from `flexBasis` + `flexGrow` rather than a fixed percentage, so
 * the gutter is subtracted for us: two 40% cells plus a gap fit on one row,
 * three do not, and both then grow to fill it. Structure like this is stated
 * inline, where nothing can drop it.
 */
export function OptionGrid({
  children,
  gap = 12,
}: {
  children: ReactNode;
  gap?: number;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
      {Children.toArray(children).map((child, i) => (
        <View key={i} style={{ flexGrow: 1, flexBasis: "40%" }}>
          {child}
        </View>
      ))}
    </View>
  );
}
