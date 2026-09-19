export type SavedTab = "saved" | "history" | "ingredients";

/**
 * Whether a tab shows the empty screen instead of its list.
 *
 * Not just `count === 0` for Saved and History: removing the last row makes
 * that true immediately, before the Undo bar has had its window. A pending undo
 * of that tab's own kind keeps the list view on screen instead of jumping
 * straight to the empty state. Ingredients has no undo.
 */
export function isTabEmpty(
  tab: SavedTab,
  counts: { saved: number; history: number; ingredients: number },
  undoKind: "saved" | "history" | null | undefined,
): boolean {
  if (tab === "ingredients") return counts.ingredients === 0;
  if (tab === "saved") return counts.saved === 0 && undoKind !== "saved";
  return counts.history === 0 && undoKind !== "history";
}
