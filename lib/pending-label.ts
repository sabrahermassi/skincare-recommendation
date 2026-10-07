import type { MatchConfidence } from "@/data/types";

/**
 * The ingredient list a user has just photographed, held for display on the
 * label result screen.
 *
 * Nothing is stored when a photo is read. The camera parks the list here and
 * the label-result screen picks it up. It lives in memory only — an abandoned
 * read is simply gone — so it is a module value rather than store state or a
 * route parameter (a list of sixty names does not belong in a URL).
 */

export type HeldLabel = {
  /** The names read off the label, in printed order. */
  ingredients: string[];
  /** How each name was matched, line for line with `ingredients` (#458). Unset in a read from before it existed. */
  matches?: (MatchConfidence | null)[];
};

let held: HeldLabel | null = null;

export function holdLabelRead(read: HeldLabel): void {
  held = { ...read };
}

/** The list being displayed, or null when nothing has been read. */
export function heldLabelRead(): HeldLabel | null {
  return held;
}

export function clearLabelRead(): void {
  held = null;
}
