import Svg, { G, Path, Rect } from "react-native-svg";

import type { BaseSkinType } from "@/data/types";

/**
 * The 44pt tiles beside each option on the skin-type step, and the modifier
 * tile beside the "also sensitive" switch.
 *
 * Transcribed from the design project's `assets/icon-*-tile.svg` rather than
 * shipped as .svg files: rendering an SVG asset in React Native needs
 * `react-native-svg-transformer` and a `metro.config.js` change, and the art
 * is four paths. Each tile carries its own backdrop and stroke colour — these
 * are illustration, not UI, so they deliberately sit outside the token palette
 * and do not shift when the accent does.
 */
export type SkinTypeIconName = BaseSkinType | "unsure" | "sensitive";

type Tile = { bg: string; stroke: string; paths: { d: string; width?: number }[] };

const TILES: Record<SkinTypeIconName, Tile> = {
  dry: {
    bg: "#F9EADE",
    stroke: "#8F5630",
    paths: [
      { d: "M23 37c5.5-6 11-6 16.5 0s11 6 16.5 0 11-6 16.5 0" },
      { d: "M23 51c5.5-6 11-6 16.5 0s11 6 16.5 0 11-6 16.5 0" },
      { d: "M23 65c5.5-6 11-6 16.5 0s11 6 16.5 0 11-6 16.5 0" },
    ],
  },
  oily: {
    bg: "#EAF0E8",
    stroke: "#288871",
    paths: [
      { d: "M38.5 27.5c5.8 7.1 8.7 12 8.7 15.9a8.7 8.7 0 0 1-17.4 0c0-3.9 2.9-8.8 8.7-15.9Z" },
      { d: "M64 31.5c4.8 5.9 7.2 10 7.2 13.2a7.2 7.2 0 1 1-14.4 0c0-3.2 2.4-7.3 7.2-13.2Z" },
      { d: "M25.5 47c-1.6 15 8.2 26 24.5 26s26.1-11 24.5-26" },
      { d: "M46 60.5a5 5 0 0 0 8 0", width: 3 },
    ],
  },
  combination: {
    bg: "#F1E4F3",
    stroke: "#5C5592",
    paths: [
      { d: "M50 50c-6-8-14.5-11.5-19.5-7.5S26 57 34 61s12-3 16-11Z" },
      { d: "M50 50c6-8 14.5-11.5 19.5-7.5S74 57 66 61s-12-3-16-11Z" },
      { d: "M50 50c-4 9-3.5 18 2 20.5S62 66 58 57s-5-9-8-7Z" },
      { d: "M50 50c4-9 3.5-18-2-20.5S38 34 42 43s5 9 8 7Z" },
      { d: "M22 34.5h5M75 68h5M26 70l3.5-3.5M72 33l3.5-3.5", width: 3 },
    ],
  },
  normal: {
    bg: "#F9EAEB",
    stroke: "#A85F6A",
    paths: [
      { d: "M50 26c6.5 8.4 9.8 14.2 9.8 18.8a9.8 9.8 0 0 1-19.6 0c0-4.6 3.3-10.4 9.8-18.8Z" },
      { d: "M24 63h52" },
      { d: "M33 72.5h12M55 72.5h12", width: 3 },
    ],
  },
  unsure: {
    bg: "#EFECE7",
    stroke: "#7C7488",
    paths: [
      { d: "M37 39.5c0-7.5 5.8-12.5 13.4-12.5 7.3 0 12.9 4.4 12.9 11.2 0 8.4-11.4 9.4-11.4 18.3" },
      { d: "M51.6 70.5v.2" },
    ],
  },
  sensitive: {
    bg: "#F0E9F5",
    stroke: "#564D8B",
    paths: [
      { d: "M74 26c2.5 22-8 40-27 41.5-8 .6-14.5-3.5-15.5-11C29.5 39 47 26 74 26Z" },
      { d: "M25 79 62 39", width: 3.2 },
    ],
  },
};

export function SkinTypeIcon({ name, size = 44 }: { name: SkinTypeIconName; size?: number }) {
  const tile = TILES[name];

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={0} y={0} width={100} height={100} rx={23.5} fill={tile.bg} />
      <G
        fill="none"
        stroke={tile.stroke}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {tile.paths.map((p) => (
          <Path key={p.d} d={p.d} strokeWidth={p.width} />
        ))}
      </G>
    </Svg>
  );
}
