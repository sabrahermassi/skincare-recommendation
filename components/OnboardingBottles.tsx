import type { ReactElement } from "react";
import { View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

/**
 * The Welcome screen's decorative background: three bezier ribbons, four
 * bubble rings, and eight washed-out bottle silhouettes, all bleeding off an
 * edge and inert (`pointerEvents="none"`).
 *
 * Every path here is transcribed from the design handoff's own SVG files
 * (`design_handoff_skintel_onboarding/assets/btl-*-pale.svg`), which each
 * carry the real ~8-line drawing wrapped in a much larger C2PA metadata
 * blob — the metadata is dropped, the geometry is copied verbatim, same
 * convention as `components/LogoMark.tsx`.
 */

const PALE_STROKE = "#BCB4C8";

type BottleProps = { width: number };

function bottleHeight(width: number) {
  return width * 1.5; // every bottle's viewBox is 100x150
}

export function BtlPumpPale({ width }: BottleProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={PALE_STROKE} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Path d="M46 20V9h22v8H50" />
        <Rect x={42} y={20} width={12} height={12} fill="#ECE8F3" />
        <Path d="M30 32h36l6 12H24z" fill="#ECE8F3" />
        <Rect x={24} y={44} width={48} height={88} rx={8} fill="#ECE8F3" />
        <Rect x={33} y={70} width={30} height={30} rx={3} strokeWidth={2.2} opacity={0.45} />
      </G>
    </Svg>
  );
}

export function BtlMistPale({ width }: BottleProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={PALE_STROKE} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Path d="M44 6h12v9H44z" fill="#E8EEF2" />
        <Path d="M38 15h20v9H38z" fill="#E8EEF2" />
        <Path d="M64 10h12M68 3l8 4M68 17l8-4" strokeWidth={2.2} opacity={0.7} />
        <Rect x={37} y={24} width={22} height={108} rx={7} fill="#E8EEF2" />
      </G>
    </Svg>
  );
}

export function BtlSerumPale({ width }: BottleProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={PALE_STROKE} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Rect x={40} y={4} width={20} height={12} rx={6} fill="#EFEAE2" />
        <Rect x={43} y={16} width={14} height={10} fill="#EFEAE2" />
        <Rect x={34} y={26} width={32} height={8} rx={2} fill="#EFEAE2" />
        <Rect x={32} y={34} width={36} height={98} rx={6} fill="#EFEAE2" />
        <Path d="M50 42v66" strokeWidth={2.2} />
        <Path d="M45 108h10l-5 8z" strokeWidth={2.2} />
      </G>
    </Svg>
  );
}

export function BtlTubePale({ width }: BottleProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={PALE_STROKE} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Rect x={43} y={6} width={14} height={11} rx={2} fill="#E9EFE9" />
        <Path
          d="M39 17h22l9 96a12 12 0 0 1-12 13H42a12 12 0 0 1-12-13z"
          fill="#E9EFE9"
        />
        <Path d="M31 122h38" strokeWidth={2.4} />
        <Path d="M40 64h20" strokeWidth={2.2} opacity={0.5} />
      </G>
    </Svg>
  );
}

export function BtlJarPale({ width }: BottleProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={PALE_STROKE} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Rect x={12} y={56} width={76} height={22} rx={8} fill="#F4EAE3" />
        <Path
          d="M19 78h62v34a18 18 0 0 1-18 18H37a18 18 0 0 1-18-18z"
          fill="#F4EAE3"
        />
        <Path d="M38 104h24" strokeWidth={2.4} opacity={0.55} />
        <Path d="M40 67h20" strokeWidth={2.4} opacity={0.45} />
      </G>
    </Svg>
  );
}

export function BtlAmpoulePale({ width }: BottleProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={PALE_STROKE} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Rect x={43} y={16} width={14} height={12} rx={4} fill="#F3E8EC" />
        <Path d="M45 28h10v10H45z" fill="#F3E8EC" />
        <Path
          d="M38 56c0-10 7-18 7-18h10s7 8 7 18v66a10 10 0 0 1-10 10h-4a10 10 0 0 1-10-10z"
          fill="#F3E8EC"
        />
        <Path d="M43 84h14" strokeWidth={2.2} opacity={0.45} />
      </G>
    </Svg>
  );
}

export function BtlSunPale({ width }: BottleProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={PALE_STROKE} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Rect x={28} y={40} width={44} height={16} rx={5} fill="#F3ECDB" />
        <Rect x={24} y={56} width={52} height={76} rx={10} fill="#F3ECDB" />
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

export function BtlCleanserPale({ width }: BottleProps) {
  return (
    <Svg width={width} height={bottleHeight(width)} viewBox="0 0 100 150" fill="none">
      <G stroke={PALE_STROKE} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <Path d="M37 6h26v14H37z" fill="#EFEBE4" />
        <Path d="M37 13h26" strokeWidth={2.2} />
        <Path d="M63 6c4 0 4 7 0 7" strokeWidth={2.2} />
        <Path d="M32 20h36l5 16H27z" fill="#EFEBE4" />
        <Rect x={27} y={36} width={46} height={96} rx={7} fill="#EFEBE4" />
        <Rect x={35} y={64} width={30} height={34} rx={3} strokeWidth={2.2} opacity={0.45} />
      </G>
    </Svg>
  );
}

/** One entry per bottle in the decorative layer: filename, position, size, tilt. */
const BOTTLES: {
  Bottle: (props: BottleProps) => ReactElement;
  style: { top?: number; bottom?: number; left?: number; right?: number };
  width: number;
  rotate: string;
  opacity: number;
}[] = [
  { Bottle: BtlPumpPale, style: { top: 52, left: -34 }, width: 112, rotate: "-13deg", opacity: 1 },
  { Bottle: BtlMistPale, style: { top: 116, right: -22 }, width: 88, rotate: "15deg", opacity: 1 },
  { Bottle: BtlSerumPale, style: { top: 262, left: -26 }, width: 76, rotate: "9deg", opacity: 0.6 },
  { Bottle: BtlTubePale, style: { top: 352, right: -24 }, width: 72, rotate: "-11deg", opacity: 0.55 },
  { Bottle: BtlJarPale, style: { bottom: 214, left: -30 }, width: 104, rotate: "11deg", opacity: 1 },
  { Bottle: BtlAmpoulePale, style: { bottom: 318, right: -12 }, width: 64, rotate: "-9deg", opacity: 0.7 },
  { Bottle: BtlSunPale, style: { bottom: 104, right: -32 }, width: 96, rotate: "13deg", opacity: 1 },
  { Bottle: BtlCleanserPale, style: { bottom: 44, left: -22 }, width: 80, rotate: "-15deg", opacity: 0.8 },
];

export function WelcomeBackdrop() {
  return (
    <View
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      pointerEvents="none"
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 427 944"
        preserveAspectRatio="none"
        fill="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      >
        <Path
          d="M-30 292C74 246 156 336 250 292S402 214 470 258"
          stroke="#D8E6DD"
          strokeWidth={11}
          strokeLinecap="round"
          opacity={0.7}
        />
        <Path
          d="M-30 336C86 292 150 380 258 336S416 268 470 302"
          stroke="#E6E0F2"
          strokeWidth={8}
          strokeLinecap="round"
          opacity={0.75}
        />
        <Path
          d="M-20 700C90 662 152 742 262 700S412 640 460 672"
          stroke="#E4EDE7"
          strokeWidth={10}
          strokeLinecap="round"
          opacity={0.65}
        />
        <Circle cx={52} cy={238} r={9} stroke="#DCE7E0" strokeWidth={3.4} />
        <Circle cx={82} cy={216} r={5.5} stroke="#DCE7E0" strokeWidth={3} />
        <Circle cx={372} cy={646} r={8} stroke="#E3DCF0" strokeWidth={3.4} />
        <Circle cx={346} cy={672} r={5} stroke="#E3DCF0" strokeWidth={3} />
      </Svg>

      {BOTTLES.map(({ Bottle, style, width, rotate, opacity }, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            ...style,
            width,
            opacity,
            transform: [{ rotate }],
          }}
        >
          <Bottle width={width} />
        </View>
      ))}
    </View>
  );
}
