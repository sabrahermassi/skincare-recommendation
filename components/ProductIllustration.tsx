import { View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import type { ProductType } from "@/data/types";

type Vessel = "serum" | "ampoule" | "jar" | "tube" | "toner" | "essence" | "sun";

/**
 * There are no real photos for this fabricated catalogue — showing stock
 * photography would misrepresent an invented product as a real one. Instead
 * every product gets a drawn vessel, grouped by container shape, on one of the
 * four Milky pastel tints.
 *
 * The art is transcribed from the design project's `assets/product-*.svg`
 * (see the note in `SkinTypeIcon` on why it is inline rather than an .svg
 * asset). The vessel-to-type and tint-to-type mappings are the design's own,
 * read off the browse and saved mockups — including the two that look
 * arbitrary: a hand cream draws as the toner bottle and a body lotion as the
 * essence bottle, because that is what those rows show.
 *
 * The tint is assigned by product family and never picked at random, so the
 * browse list gets the varied-pastel look of a real skincare shelf while the
 * colour still means something.
 */
const VESSEL_BY_TYPE: Record<ProductType, Vessel> = {
  cleanser: "tube",
  "body-wash": "tube",
  toner: "toner",
  essence: "essence",
  serum: "serum",
  ampoule: "ampoule",
  moisturizer: "jar",
  "body-lotion": "essence",
  sunscreen: "sun",
  "hand-cream": "toner",
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

/** One outline colour across every vessel, so a mixed list reads as one set. */
const OUTLINE = "#514B5C";

function VesselPath({ vessel }: { vessel: Vessel }) {
  switch (vessel) {
    case "serum":
      return (
        <>
          <Path d="M27.5 4.5h7v5h-7z" fill="#E7E2DB" />
          <Path d="M34.5 5.5h6.5v3h-6.5z" fill="#E7E2DB" />
          <Path d="M28.5 9.5h5v6.5h-5z" fill="#EDE9E2" />
          <Path
            d="M23 25c0-5.5 5.5-9 5.5-9h5s5.5 3.5 5.5 9v24a5 5 0 0 1-5 5H28a5 5 0 0 1-5-5V25Z"
            fill="#FBF4E6"
          />
          <Path d="M23 31h16v14H23z" fill="#F0DFB8" />
          <Path d="M26.5 36h7" strokeWidth={1.6} opacity={0.5} />
        </>
      );
    case "ampoule":
      return (
        <>
          <Rect x={27} y={4} width={10} height={10} rx={3} fill="#E4DEF0" />
          <Path d="M29 14h6v4h-6z" fill="#EDE9E2" />
          <Path d="M23.5 18h17v31a5 5 0 0 1-5 5h-7a5 5 0 0 1-5-5V18Z" fill="#EDE9F6" />
          <Path d="M23.5 30h17v14h-17z" fill="#D6CEEB" />
        </>
      );
    case "jar":
      return (
        <>
          <Rect x={14.5} y={17} width={35} height={11} rx={4} fill="#F8E5EA" />
          <Path d="M17.5 28h29v16a7 7 0 0 1-7 7H24.5a7 7 0 0 1-7-7V28Z" fill="#F1D2DB" />
          <Circle cx={32} cy={22.5} r={3} fill="#FCF5F7" />
          <Path d="M24 37h9" strokeWidth={1.6} opacity={0.5} />
        </>
      );
    case "tube":
      return (
        <>
          <Rect x={25.5} y={5} width={13} height={7} rx={2.2} fill="#E7E2DB" />
          <Path d="M22 12h20v37a5 5 0 0 1-5 5H27a5 5 0 0 1-5-5V12Z" fill="#FCFAF6" />
          <Path d="M22 25h20v15H22z" fill="#BCD7DC" />
          <Path d="M36 27.5h6v10h-6z" fill="#EFDC93" />
          <Path d="M26 30.5h6M26 35h4" strokeWidth={1.6} opacity={0.55} />
        </>
      );
    case "toner":
      return (
        <>
          <Rect x={27} y={4} width={10} height={7.5} rx={2} fill="#E7E2DB" />
          <Path d="M29.5 11.5h5v5h-5z" fill="#EDF3EE" />
          <Path
            d="M23 28c0-6 6.5-11.5 6.5-11.5h5S41 22 41 28v21a5 5 0 0 1-5 5H28a5 5 0 0 1-5-5V28Z"
            fill="#EDF5EF"
          />
          <Path d="M23 32h18v15H23z" fill="#C9E2D2" />
          <Path d="M27 37.5h7" strokeWidth={1.6} opacity={0.55} />
        </>
      );
    case "essence":
      return (
        <>
          <Path d="M27.5 4.5h7v5h-7z" fill="#E7E2DB" />
          <Path d="M34.5 5.5h6.5v3h-6.5z" fill="#E7E2DB" />
          <Path d="M28.5 9.5h5v5.5h-5z" fill="#EDE9E2" />
          <Path d="M23.5 15h17v34a5 5 0 0 1-5 5h-7a5 5 0 0 1-5-5V15Z" fill="#EFE7DA" />
          <Path d="M23.5 28h17v14h-17z" fill="#DCCDB4" />
          <Path d="M27 34h7" strokeWidth={1.6} opacity={0.5} />
        </>
      );
    case "sun":
      return (
        <>
          <Rect x={25.5} y={4.5} width={13} height={8} rx={2.2} fill="#F0DC96" />
          <Path
            d="M22.5 12.5h19v34a6.5 6.5 0 0 1-6.5 6.5h-6a6.5 6.5 0 0 1-6.5-6.5V12.5Z"
            fill="#FCFAF6"
          />
          <Path d="M22.5 24h19v15h-19z" fill="#F6E5AC" />
          <Circle cx={32} cy={31.5} r={4.2} fill="#FCFAF6" />
        </>
      );
  }
}

type Props = {
  type: ProductType;
  /** Fixed pixel size (detail hero, compare thumbnail). Omit to fill the parent. */
  size?: number;
  /**
   * Taller than it is wide, which is how the design draws the shelf and result
   * tiles (48×56 and 58×66) — a bottle in a square box reads as a sticker.
   * Defaults to `size`.
   */
  height?: number;
  /** Corner radius class for the tile. Rows use a tighter one than cards. */
  radius?: string;
};

export function ProductIllustration({ type, size, height, radius = "rounded-card" }: Props) {
  const vessel = VESSEL_BY_TYPE[type];
  const backdrop = BACKDROP_BY_TYPE[type];

  return (
    <View
      className={`items-center justify-center ${radius} ${backdrop} ${
        size ? "" : "aspect-square w-full"
      }`}
      style={size ? { width: size, height: height ?? size } : undefined}
    >
      {/* Percentage sizing means this works identically whether the wrapper is
          a fixed pixel box or fills its parent. */}
      <Svg width="82%" height="82%" viewBox="0 0 64 64">
        <G stroke={OUTLINE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <VesselPath vessel={vessel} />
        </G>
      </Svg>
    </View>
  );
}
