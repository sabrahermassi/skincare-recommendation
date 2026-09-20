/** The raised scan button in the middle of the tab bar: its diameter, and how far it rises above the bar. */
export const SCAN_BUTTON = 68;
export const SCAN_BUTTON_LIFT = 28;

/** The floating tab bar: its height, its gap from the screen's sides, and its gap above the bottom edge. */
export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_SIDE_MARGIN = 16;
const TAB_BAR_BOTTOM_GAP = 12;

/** How far above the screen's bottom edge the bar floats. */
export function tabBarBottom(insetBottom: number): number {
  return Math.max(insetBottom, TAB_BAR_BOTTOM_GAP);
}

/** Room a scrolling tab screen leaves at its end so its last row clears the bar. */
export function tabBarClearance(insetBottom: number): number {
  return tabBarBottom(insetBottom) + TAB_BAR_HEIGHT + 16;
}
