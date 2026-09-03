import type { ReactElement } from "react";
import { View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import type { PackagingType, ProductType } from "@/data/types";

/**
 * The full-colour bottle icon set — every product image and hand-drawn
 * placeholder vessel (the old `ProductIllustration`) replaced with these
 * eight, per `design_handoff_skintel_onboarding/bottle-set.html`.
 *
 * Same transcription convention as `LogoMark.tsx` and
 * `components/OnboardingBottles.tsx`: each source file
 * (`assets/btl-<type>.svg`) wraps a handful of real paths in a large C2PA
 * metadata blob, so the metadata is dropped and the geometry copied
 * verbatim. This file holds WEIGHT 1 (full colour, `#463F57` stroke,
 * category-tinted fill) — WEIGHT 2 (`-pale`, background scatter only) stays
 * in `OnboardingBottles.tsx`, since the design doc is explicit that the pale
 * weight must never appear in the foreground.
 */

const INK = "#463F57";

type IconProps = { width: number };

function bottleHeight(width: number) {
  return width * 1.5; // every bottle's viewBox is 100x150
}

export function BtlSerum({ width }: IconProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={INK} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Rect x={40} y={4} width={20} height={12} rx={6} fill="#F1E8D8" />
        <Rect x={43} y={16} width={14} height={10} fill="#F1E8D8" />
        <Rect x={34} y={26} width={32} height={8} rx={2} fill="#F1E8D8" />
        <Rect x={32} y={34} width={36} height={98} rx={6} fill="#F1E8D8" />
        <Path d="M50 42v66" strokeWidth={2.2} />
        <Path d="M45 108h10l-5 8z" strokeWidth={2.2} />
      </G>
    </Svg>
  );
}

/** Cleanser tube — also stands in for a body wash, which shares the vessel. */
export function BtlTube({ width }: IconProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={INK} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Rect x={43} y={6} width={14} height={11} rx={2} fill="#E4EFE7" />
        <Path
          d="M39 17h22l9 96a12 12 0 0 1-12 13H42a12 12 0 0 1-12-13z"
          fill="#E4EFE7"
        />
        <Path d="M31 122h38" strokeWidth={2.4} />
        <Path d="M40 64h20" strokeWidth={2.2} opacity={0.5} />
      </G>
    </Svg>
  );
}

/** Lotion pump. */
export function BtlPump({ width }: IconProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={INK} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Path d="M46 20V9h22v8H50" />
        <Rect x={42} y={20} width={12} height={12} fill="#E9E4F4" />
        <Path d="M30 32h36l6 12H24z" fill="#E9E4F4" />
        <Rect x={24} y={44} width={48} height={88} rx={8} fill="#E9E4F4" />
        <Rect x={33} y={70} width={30} height={30} rx={3} strokeWidth={2.2} opacity={0.45} />
      </G>
    </Svg>
  );
}

/** Cream jar. */
export function BtlJar({ width }: IconProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={INK} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Rect x={12} y={56} width={76} height={22} rx={8} fill="#F7E6DA" />
        <Path
          d="M19 78h62v34a18 18 0 0 1-18 18H37a18 18 0 0 1-18-18z"
          fill="#F7E6DA"
        />
        <Path d="M38 104h24" strokeWidth={2.4} opacity={0.55} />
        <Path d="M40 67h20" strokeWidth={2.4} opacity={0.45} />
      </G>
    </Svg>
  );
}

export function BtlMist({ width }: IconProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={INK} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Path d="M44 6h12v9H44z" fill="#E2ECF2" />
        <Path d="M38 15h20v9H38z" fill="#E2ECF2" />
        <Path d="M64 10h12M68 3l8 4M68 17l8-4" strokeWidth={2.2} opacity={0.7} />
        <Rect x={37} y={24} width={22} height={108} rx={7} fill="#E2ECF2" />
      </G>
    </Svg>
  );
}

/**
 * Toner. Filename is `btl-cleanser.svg` in the design handoff — the doc calls
 * this out explicitly ("filename and label differ") — but the exported
 * component and the `PackagingType` value are both named for what it draws.
 */
export function BtlToner({ width }: IconProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={INK} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Path d="M37 6h26v14H37z" fill="#EFE9DE" />
        <Path d="M37 13h26" strokeWidth={2.2} />
        <Path d="M63 6c4 0 4 7 0 7" strokeWidth={2.2} />
        <Path d="M32 20h36l5 16H27z" fill="#EFE9DE" />
        <Rect x={27} y={36} width={46} height={96} rx={7} fill="#EFE9DE" />
        <Rect x={35} y={64} width={30} height={34} rx={3} strokeWidth={2.2} opacity={0.45} />
      </G>
    </Svg>
  );
}

export function BtlAmpoule({ width }: IconProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={INK} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Rect x={43} y={16} width={14} height={12} rx={4} fill="#F6E2E8" />
        <Path d="M45 28h10v10H45z" fill="#F6E2E8" />
        <Path
          d="M38 56c0-10 7-18 7-18h10s7 8 7 18v66a10 10 0 0 1-10 10h-4a10 10 0 0 1-10-10z"
          fill="#F6E2E8"
        />
        <Path d="M43 84h14" strokeWidth={2.2} opacity={0.45} />
      </G>
    </Svg>
  );
}

export function BtlSunscreen({ width }: IconProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={INK} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Rect x={28} y={40} width={44} height={16} rx={5} fill="#F6E9C0" />
        <Rect x={24} y={56} width={52} height={76} rx={10} fill="#F6E9C0" />
        <Circle cx={50} cy={94} r={12} strokeWidth={2.6} />
        <Path
          d="M50 74v6M50 108v6M28 94h6M66 94h6M35 79l4 4M61 105l4 4M65 79l-4 4M39 105l-4 4"
          strokeWidth={2.2}
          opacity={0.7}
        />
      </G>
    </Svg>
  );
}

const PACKAGING_ICON: Record<PackagingType, (props: IconProps) => ReactElement> = {
  serum: BtlSerum,
  "cleanser-tube": BtlTube,
  "lotion-pump": BtlPump,
  "cream-jar": BtlJar,
  mist: BtlMist,
  toner: BtlToner,
  ampoule: BtlAmpoule,
  sunscreen: BtlSunscreen,
};

/** The one helper that maps a packaging type to its icon. Unknown -> serum. */
export function bottleIconFor(
  type: PackagingType | null | undefined
): (props: IconProps) => ReactElement {
  if (type && type in PACKAGING_ICON) return PACKAGING_ICON[type];
  return BtlSerum;
}

/**
 * A sensible `productType` for catalogue rows that predate the column — real
 * sources (Supabase) carry the merchandising `type` but not yet a packaging
 * shape. Not used by the hand-written sample catalogue, which sets
 * `productType` explicitly per product.
 */
export function defaultPackagingType(type: ProductType): PackagingType {
  switch (type) {
    case "cleanser":
    case "body-wash":
      return "cleanser-tube";
    case "toner":
      return "toner";
    case "essence":
      return "serum";
    case "serum":
      return "serum";
    case "ampoule":
      return "ampoule";
    case "moisturizer":
    case "hand-cream":
      return "cream-jar";
    case "sunscreen":
      return "sunscreen";
    case "body-lotion":
      return "lotion-pump";
  }
}

type Props = {
  type: PackagingType | null | undefined;
  /** Fixed pixel size (detail hero, compare thumbnail). Omit to fill the parent. */
  size?: number;
  /**
   * Taller than it is wide, matching the shelf and result tiles (48×56,
   * 58×66) — a bottle in a square box reads as a sticker. Defaults to `size`.
   */
  height?: number;
  /** Corner radius class for the tile. Rows use a tighter one than cards. */
  radius?: string;
};

/**
 * The product thumbnail slot: a neutral rounded tile holding the icon. No
 * per-type tint on the tile itself — the icon already carries its category's
 * colour (see the bottle-set.html reference, which shows every icon on plain
 * canvas), so a second tinted layer behind it just competed with the art.
 */
export function BottleIcon({ type, size, height, radius = "rounded-card" }: Props) {
  const Icon = bottleIconFor(type);
  // 62% of the tile, same proportion the old vessel drawing used — enough
  // margin around the bottle that it reads as a thumbnail, not a crop.
  const iconWidth = (size ?? 64) * 0.62;

  return (
    <View
      className={`items-center justify-center bg-canvas ${radius} ${
        size ? "" : "aspect-square w-full"
      }`}
      style={size ? { width: size, height: height ?? size } : undefined}
    >
      <Icon width={iconWidth} />
    </View>
  );
}
