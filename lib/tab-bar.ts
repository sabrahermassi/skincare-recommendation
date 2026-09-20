/** The raised scan button in the middle of the tab bar: its diameter, and how far it rises above the bar. */
export const SCAN_BUTTON = 68;
export const SCAN_BUTTON_LIFT = 28;

/** The floating tab bar: its height, its gap from the screen's sides, and its gap above the bottom edge. */
export const TAB_BAR_HEIGHT = 60;
/** Less rounded than a pill: a soft rectangle. */
export const TAB_BAR_RADIUS = 22;
export const TAB_BAR_SIDE_MARGIN = 20;
const TAB_BAR_BOTTOM_GAP = 20;

/** How far above the screen's bottom edge the bar floats. */
export function tabBarBottom(insetBottom: number): number {
  return Math.max(insetBottom, TAB_BAR_BOTTOM_GAP);
}

/** Room a scrolling tab screen leaves at its end so its last row clears the bar. */
export function tabBarClearance(insetBottom: number): number {
  return tabBarBottom(insetBottom) + TAB_BAR_HEIGHT + 16;
}

/** The clear space between the scan button and the bar's edge where the bar curves around it. */
export const SCAN_NOTCH_GAP = 4;
