import Svg, { Ellipse, Path, Rect } from "react-native-svg";

import { CTA, LINE, SELECTED, SURFACE } from "@/lib/tokens";

// A muted sage for the leaf sprig — decorative-only, so it's not one of the
// UI-chrome tokens in lib/tokens.ts (those govern text/surfaces/controls,
// not one-off illustration accents, same as the raster quiz icons carrying
// their own painted colors).
const LEAF = "#8C9A7B";

/**
 * Saved's empty-state artwork: a shelf holding three simple bottle/jar
 * shapes with a leaf sprig, echoing design-watercolor/reference.png's
 * "Saved" screen. Deliberately simple line art rather than a painterly
 * match — there's no high-res source for that illustration to build from,
 * and a blurry upscale of the reference's low-res thumbnail would look
 * worse than a clean, on-brand shape drawing.
 */
export function SavedEmptyIllustration({ width = 200 }: { width?: number }) {
  const height = (width * 170) / 200;
  return (
    <Svg width={width} height={height} viewBox="0 0 200 170">
      <Ellipse cx={100} cy={82} rx={88} ry={72} fill={SELECTED} />

      {/* Leaf sprig, arching up behind the bottles. */}
      <Path
        d="M138 40c10 14 12 32 4 48"
        stroke={LEAF}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M141 46c8-6 18-6 25 1-8 5-18 5-25-1Z"
        fill={LEAF}
      />
      <Path
        d="M137 62c9-4 19-2 25 6-9 3-19 1-25-6Z"
        fill={LEAF}
      />
      <Path
        d="M134 78c9-2 18 2 22 10-9 1-18-3-22-10Z"
        fill={LEAF}
      />

      {/* Shelf. */}
      <Rect x={28} y={128} width={144} height={6} rx={3} fill={LINE} />

      {/* Tall dropper bottle. */}
      <Rect x={54} y={72} width={18} height={56} rx={4} fill={SURFACE} stroke={CTA} strokeWidth={2} />
      <Rect x={59} y={59} width={8} height={15} rx={2} fill={CTA} />

      {/* Jar with lid, centered — the tallest silhouette. */}
      <Rect x={84} y={88} width={30} height={40} rx={7} fill={SURFACE} stroke={CTA} strokeWidth={2} />
      <Rect x={81} y={80} width={36} height={11} rx={5} fill={CTA} />

      {/* Small round bottle. */}
      <Rect x={126} y={94} width={17} height={34} rx={7} fill={SURFACE} stroke={CTA} strokeWidth={2} />
      <Rect x={130} y={87} width={9} height={10} rx={2} fill={CTA} />
    </Svg>
  );
}
