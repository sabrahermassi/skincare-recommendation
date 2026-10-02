import { ReduceMotion } from "react-native-reanimated";

/**
 * How a selection moves from one place to the next, like a drop of water
 * (owner, 2 October 2026): the tab bar's pill and every switch's thumb. Each
 * of its two edges is on its own spring. The edge in front (`FLOW_LEAD`) moves
 * off quickly and the edge behind (`FLOW_TRAIL`) follows, so it stretches as
 * it travels and gathers again where it lands. With Reduce Motion on it
 * simply moves.
 */
export const FLOW_LEAD = { mass: 0.6, stiffness: 260, damping: 20, reduceMotion: ReduceMotion.System } as const;
export const FLOW_TRAIL = { mass: 0.9, stiffness: 130, damping: 19, reduceMotion: ReduceMotion.System } as const;
