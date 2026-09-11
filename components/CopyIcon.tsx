import Svg, { Path, Rect } from "react-native-svg";
import { INK } from "@/lib/tokens";

/**
 * Copy / copied — one icon, two states, so tapping it doesn't need a toast
 * the rest of this app has no component for. Shared by the scanned-product
 * and pasted-list ingredient screens, which both put it in a `ScreenHeader`.
 */
export function CopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
        <Path
          d="m5 12.6 4.6 4.6L19 6.8"
          stroke="#4B7A5E"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Rect x={8.5} y={8.5} width={11} height={11} rx={2.2} stroke={INK} strokeWidth={1.7} />
      <Path
        d="M15 8.5V6.7a2.2 2.2 0 0 0-2.2-2.2H6.7a2.2 2.2 0 0 0-2.2 2.2v6.1a2.2 2.2 0 0 0 2.2 2.2h1.8"
        stroke={INK}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
