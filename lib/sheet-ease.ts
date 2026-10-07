import { Easing } from "react-native";

/**
 * How a sheet rises: off quickly, then a long soft landing, the curve of iOS's
 * own sheets. A plain cubic ease-out got there as fast but stopped short at
 * the end, which read as the sheet arriving with a bump.
 */
export const SHEET_EASE = Easing.bezier(0.32, 0.72, 0, 1);
