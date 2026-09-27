import { CAPSULE_HEIGHT } from "@/lib/tokens";

/**
 * The raised scan button in the middle of the tab bar: its diameter, how far it
 * rises above the bar, and the camera icon on it. 10% smaller than it was (owner,
 * 27 September 2026): 75 to 68, the icon 34 to 31. Its centre stays about 12pt
 * below the bar's top edge (34 − 22), where it sat before.
 */
export const SCAN_BUTTON = 68;
export const SCAN_BUTTON_LIFT = 22;
export const SCAN_ICON = 31;

/**
 * The floating tab bar: its height, its gap from the screen's sides, and its gap
 * above the bottom edge. The same height as the segmented switch (owner, 27
 * September 2026), after a brief try at 20% thinner.
 */
export const TAB_BAR_HEIGHT = CAPSULE_HEIGHT;
/** A full capsule, round at both ends (owner's reference). */
export const TAB_BAR_RADIUS = TAB_BAR_HEIGHT / 2;
export const TAB_BAR_SIDE_MARGIN = 20;
const TAB_BAR_BOTTOM_GAP = 12;
/** On a phone with a home-indicator strip the bar dips this far into it. */
const TAB_BAR_INTO_INSET = 12;

/** How far above the screen's bottom edge the bar floats. */
export function tabBarBottom(insetBottom: number): number {
  return insetBottom > 0 ? Math.max(insetBottom - TAB_BAR_INTO_INSET, TAB_BAR_BOTTOM_GAP) : TAB_BAR_BOTTOM_GAP;
}

/** Room a scrolling tab screen leaves at its end so its last row clears the bar. */
export function tabBarClearance(insetBottom: number): number {
  return tabBarBottom(insetBottom) + TAB_BAR_HEIGHT + 16;
}

