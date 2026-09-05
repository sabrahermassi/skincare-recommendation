import Svg, { G, Path, Rect } from "react-native-svg";

/**
 * The Ellow mark: five barcode bars and a scan beam inside four rounded scan
 * brackets. Geometry transcribed verbatim from `assets/ellow-mark.svg` per
 * `design_handoff_ellow_welcome/README.md` — the bar widths (2 / 1.33 / 2 / 1
 * / 2) are traced from a real barcode photo, so they are not re-authored here.
 */
export function EllowMark({ size = 44 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 110 110">
      <EllowMarkBrackets />
      <G fill="#463F57">
        <Rect x={23.5} y={34} width={8.46} height={42} rx={1.4} />
        <Rect x={38.42} y={34} width={5.64} height={42} rx={1.4} />
        <Rect x={50.03} y={34} width={8.46} height={42} rx={1.4} />
        <Rect x={66.61} y={34} width={4.23} height={42} rx={1.4} />
        <Rect x={76.55} y={34} width={8.46} height={42} rx={1.4} />
      </G>
      <Rect x={20} y={52} width={70} height={6} rx={3} fill="#8B7FB6" />
    </Svg>
  );
}

/**
 * The mark's four corner brackets on their own, for the Welcome screen's
 * "scan the product" tile — that icon shows the bottle being scanned, not the
 * barcode mark itself, so only the brackets are reused there.
 */
export function EllowMarkBrackets() {
  return (
    <G stroke="#8B7FB6" strokeWidth={6.5} fill="none" strokeLinecap="round">
      <Path d="M6 28V16a10 10 0 0 1 10-10h12" />
      <Path d="M82 6h12a10 10 0 0 1 10 10v12" />
      <Path d="M104 82v12a10 10 0 0 1-10 10H82" />
      <Path d="M28 104H16a10 10 0 0 1-10-10V82" />
    </G>
  );
}
