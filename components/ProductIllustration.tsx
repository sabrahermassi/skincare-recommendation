import { View } from "react-native";
import Svg, { Ellipse, Path, Rect } from "react-native-svg";

import type { ProductType } from "@/data/types";
import { COLORS } from "@/lib/colors";

type Vessel = "pump" | "dropper" | "jar" | "tube";

/**
 * There are no real photos for this fabricated catalogue — showing stock
 * photography would misrepresent an invented product as a real one. Instead
 * every product gets a simple vessel silhouette, grouped by container shape,
 * on one of the four Milky pastel tints.
 *
 * The tint is assigned by product family and never picked at random, so the
 * browse grid gets the varied-pastel-backdrop look of a real skincare shelf
 * while the color still means something. The vessel itself is always ink —
 * one dark silhouette across all four tints keeps the grid coherent.
 */
const VESSEL_BY_TYPE: Record<ProductType, Vessel> = {
  cleanser: "pump",
  "body-wash": "pump",
  toner: "dropper",
  essence: "dropper",
  serum: "dropper",
  ampoule: "dropper",
  moisturizer: "jar",
  "body-lotion": "jar",
  sunscreen: "tube",
  "hand-cream": "tube",
};

const BACKDROP_BY_TYPE: Record<ProductType, string> = {
  cleanser: "bg-tint-pink",
  "body-wash": "bg-tint-pink",
  toner: "bg-tint-mint",
  essence: "bg-tint-mint",
  serum: "bg-tint-mint",
  ampoule: "bg-tint-mint",
  moisturizer: "bg-tint-peach",
  "body-lotion": "bg-tint-peach",
  "hand-cream": "bg-tint-peach",
  sunscreen: "bg-tint-lilac",
};

function VesselPath({ vessel, fill }: { vessel: Vessel; fill: string }) {
  switch (vessel) {
    case "pump":
      return (
        <>
          <Rect x={20} y={28} width={24} height={28} rx={6} fill={fill} />
          <Rect x={27} y={18} width={10} height={12} fill={fill} />
          <Rect x={22} y={8} width={18} height={11} rx={3} fill={fill} />
          <Rect x={38} y={10} width={13} height={4} rx={2} fill={fill} />
        </>
      );
    case "dropper":
      return (
        <>
          <Path d="M18,56 L18,38 L24,22 L40,22 L46,38 L46,56 Z" fill={fill} />
          <Rect x={28} y={10} width={8} height={13} fill={fill} />
          <Rect x={24} y={4} width={16} height={8} rx={2} fill={fill} />
        </>
      );
    case "jar":
      return (
        <>
          <Rect x={16} y={28} width={32} height={28} rx={10} fill={fill} />
          <Rect x={15} y={20} width={34} height={9} rx={4} fill={fill} />
          <Ellipse cx={32} cy={20} rx={17} ry={4} fill={fill} />
        </>
      );
    case "tube":
      return (
        <>
          <Rect x={20} y={16} width={24} height={38} rx={9} fill={fill} />
          <Path d="M26,16 L24,6 L40,6 L38,16 Z" fill={fill} />
          <Rect x={27} y={1} width={10} height={6} rx={2} fill={fill} />
        </>
      );
  }
}

type Props = {
  type: ProductType;
  /** Fixed pixel size (detail hero, compare thumbnail). Omit to fill the parent — the browse grid card sizes itself. */
  size?: number;
};

export function ProductIllustration({ type, size }: Props) {
  const vessel = VESSEL_BY_TYPE[type];
  const backdrop = BACKDROP_BY_TYPE[type];

  return (
    <View
      className={`items-center justify-center rounded-card ${backdrop} ${
        size ? "" : "aspect-square w-full"
      }`}
      style={size ? { width: size, height: size } : undefined}
    >
      {/* Percentage sizing means this works identically whether the wrapper is a fixed pixel box or fills its parent. */}
      <Svg width="60%" height="60%" viewBox="0 0 64 64">
        <VesselPath vessel={vessel} fill={COLORS.ink} />
      </Svg>
    </View>
  );
}
