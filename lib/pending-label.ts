/**
 * The ingredient list a user has just photographed, held for the few seconds
 * between reading it and saving the product.
 *
 * Nothing is stored when a photo is read: a product is saved only once it has a
 * barcode, a name and an ingredient list, and the barcode and the name may still
 * be missing at that point. The camera parks the list here and the add-product
 * screen picks it up. It lives in memory only — an abandoned read is simply
 * gone — so it is a module value rather than store state or a route parameter
 * (a list of sixty names does not belong in a URL).
 */

export type LabelRead = {
  /** The names read off the label, in printed order. */
  ingredients: string[];
  /** The barcode the user already scanned, when they had one. */
  barcode?: string;
};

let held: LabelRead | null = null;

export function holdLabelRead(read: LabelRead): void {
  held = read;
}

/** The list being added, or null when nothing has been read. */
export function heldLabelRead(): LabelRead | null {
  return held;
}

export function clearLabelRead(): void {
  held = null;
}
