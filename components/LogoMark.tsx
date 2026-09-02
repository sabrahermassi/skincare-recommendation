import Svg, { G, Path, Rect } from "react-native-svg";

/**
 * The SkinTel mark: a scanner's corner brackets around a dropper silhouette
 * crossed by the scan line. Transcribed from the design project's
 * `assets/logo-mark.svg` — see the note in `SkinTypeIcon` on why the art is
 * inline rather than an .svg asset.
 *
 * The bracket and scan line take the accent; the dropper stays a darker
 * violet so the mark still reads at 28pt in the browse header, where the
 * accent alone would flatten into one shape.
 */
export function LogoMark({ size = 120 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 110 110">
      <G stroke="#8B7FB6" strokeWidth={6.5} fill="none" strokeLinecap="round">
        <Path d="M6 28 V16 a10 10 0 0 1 10-10 h12" />
        <Path d="M82 6 h12 a10 10 0 0 1 10 10 v12" />
        <Path d="M104 82 v12 a10 10 0 0 1-10 10 H82" />
        <Path d="M28 104 H16 a10 10 0 0 1-10-10 V82" />
      </G>
      <Path
        d="M48.5 46 C48.5 39 26.5 39 26.5 47 C26.5 54 48.5 56 48.5 64 C48.5 71 26.5 71 26.5 64"
        fill="none"
        stroke="#463F57"
        strokeWidth={6}
      />
      <Rect x={23.5} y={52} width={63} height={6} fill="#8B7FB6" />
      <Rect x={69.75} y={52} width={6} height={22} fill="#8B7FB6" />
    </Svg>
  );
}
