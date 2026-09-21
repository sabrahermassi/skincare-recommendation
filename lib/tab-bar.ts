/**
 * The raised scan button in the middle of the tab bar: its diameter, how far it
 * rises above the bar, and the camera icon on it. The button is 10% larger than
 * it was (68 to 75) and the icon 20% (28 to 34); the lift grew with it (22 to 25)
 * so the button grows around the same centre.
 */
export const SCAN_BUTTON = 75;
export const SCAN_BUTTON_LIFT = 25;
export const SCAN_ICON = 34;

/** The floating tab bar: its height, its gap from the screen's sides, and its gap above the bottom edge. */
export const TAB_BAR_HEIGHT = 65;
/** Less rounded than a pill: a soft rectangle. */
export const TAB_BAR_RADIUS = 22;
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

