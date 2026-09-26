import * as Haptics from "expo-haptics";

/**
 * The app's haptics, in Apple's vocabulary (#313). One place, so a tap feels
 * the same wherever it happens and a failure (web, a phone with haptics off)
 * never reaches the caller.
 *
 *   tap      a light tick on an important action — Save, Scan, Continue
 *   select   a choice changing — a quiz answer, a chip
 *   success  something worked — a product found, a label read, a save
 *   warning  something didn't, or is about to be destroyed
 */
export const haptic = {
  tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  select: () => void Haptics.selectionAsync().catch(() => {}),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};
