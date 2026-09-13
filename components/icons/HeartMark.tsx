import Svg, { Path } from "react-native-svg";

import { TERRACOTTA } from "@/components/shell/shared";

/**
 * The app's one heart glyph — app icon, nav-bar mark, and the splash
 * wordmark's accessory all draw from this single path, per the "heart, not
 * the script" brand decision (see BrandSplash.tsx). `scripts/generate-icons.mjs`
 * duplicates this exact path string for the app-icon PNGs it rasterizes
 * outside the RN tree; keep the two in sync if this path ever changes.
 */
export const HEART_PATH =
  "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z";

type Props = {
  size?: number;
  color?: string;
  /** @default "outline" */
  variant?: "outline" | "filled";
  strokeWidth?: number;
};

export function HeartMark({ size = 24, color = TERRACOTTA, variant = "outline", strokeWidth = 1.8 }: Props) {
  const outline = variant === "outline";
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={HEART_PATH}
        fill={outline ? "none" : color}
        stroke={outline ? color : "none"}
        strokeWidth={outline ? strokeWidth : 0}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
