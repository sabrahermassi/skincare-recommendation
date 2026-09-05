import { Image } from "expo-image";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

/**
 * The Welcome screen's inert background layer (0a in the handoff): three
 * bezier ribbons plus six washed-out product bottles, all bleeding off an
 * edge. Positions are the handoff's own pixel values against its 427-wide
 * reference viewport — real devices sit close enough to that width, and
 * every bottle bleeds off an edge anyway, so the slight stretch is invisible.
 *
 * Two rules if this is ever repositioned (see the handoff): everything bleeds
 * off an edge, and opacity drops in the middle band where the copy sits.
 */

const ASPECT = {
  essence: 284 / 650,
  serum: 252 / 616,
  cream: 388 / 372,
  toner: 272 / 628,
  cleanser: 326 / 586,
  sun: 328 / 616,
};

const BOTTLES: {
  source: number;
  style: { top?: number; bottom?: number; left?: number; right?: number };
  width: number;
  aspect: number;
  rotate: string;
  opacity: number;
}[] = [
  {
    source: require("@/assets/images/v2/btl-essence-pale.png"),
    style: { top: 44, left: -42 },
    width: 112,
    aspect: ASPECT.essence,
    rotate: "-12deg",
    opacity: 1,
  },
  {
    source: require("@/assets/images/v2/btl-serum-pale.png"),
    style: { top: 126, right: -30 },
    width: 96,
    aspect: ASPECT.serum,
    rotate: "14deg",
    opacity: 1,
  },
  {
    source: require("@/assets/images/v2/btl-cream-pale.png"),
    style: { top: 330, left: -34 },
    width: 104,
    aspect: ASPECT.cream,
    rotate: "8deg",
    opacity: 0.55,
  },
  {
    source: require("@/assets/images/v2/btl-toner-pale.png"),
    style: { bottom: 236, right: -36 },
    width: 100,
    aspect: ASPECT.toner,
    rotate: "-10deg",
    opacity: 0.6,
  },
  {
    source: require("@/assets/images/v2/btl-cleanser-pale.png"),
    style: { bottom: 118, left: -38 },
    width: 118,
    aspect: ASPECT.cleanser,
    rotate: "11deg",
    opacity: 1,
  },
  {
    source: require("@/assets/images/v2/btl-sun-pale.png"),
    style: { bottom: 34, right: -34 },
    width: 104,
    aspect: ASPECT.sun,
    rotate: "13deg",
    opacity: 0.85,
  },
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
          d="M-30 300C80 252 158 344 252 300S404 220 470 266"
          stroke="#DDEAE2"
          strokeWidth={12}
          strokeLinecap="round"
          opacity={0.62}
        />
        <Path
          d="M-30 344C92 298 152 388 260 344S418 274 470 310"
          stroke="#E8E2F3"
          strokeWidth={8}
          strokeLinecap="round"
          opacity={0.7}
        />
        <Path
          d="M-20 712C96 672 154 754 264 712S414 650 460 684"
          stroke="#E4EDE7"
          strokeWidth={10}
          strokeLinecap="round"
          opacity={0.6}
        />
      </Svg>

      {BOTTLES.map(({ source, style, width, aspect, rotate, opacity }, i) => (
        <Image
          key={i}
          source={source}
          contentFit="contain"
          style={{
            position: "absolute",
            ...style,
            width,
            height: width / aspect,
            opacity,
            transform: [{ rotate }],
          }}
        />
      ))}
    </View>
  );
}
