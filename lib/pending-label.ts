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

export type HeldLabel = {
  /** The names read off the label, in printed order. */
  ingredients: string[];
  /** Proof the list came from a read, needed to save it. */
  readToken: string;
  /** The barcode the user already scanned, when they had one. */
  barcode?: string;
  /**
   * When the read was received, on this device's own clock. Only ever
   * passed explicitly by tests simulating an old read — production always
   * omits it and gets the actual moment of the call.
   *
   * `readToken`'s deadline is a server epoch; comparing it straight against
   * `Date.now()` means a device clock running ahead of the server's marks a
   * token expired that has barely been read (see add-product.tsx). Elapsed
   * time since receipt, measured entirely on this device, isn't exposed to
   * that skew the same way — a constant offset between the device and
   * server clocks cancels out of a same-device subtraction.
   */
  receivedAt?: number;
};

type StoredLabel = HeldLabel & { receivedAt: number };

let held: StoredLabel | null = null;

export function holdLabelRead(read: HeldLabel): void {
  held = { ...read, receivedAt: read.receivedAt ?? Date.now() };
}

/** The list being added, or null when nothing has been read. */
export function heldLabelRead(): StoredLabel | null {
  return held;
}

export function clearLabelRead(): void {
  held = null;
}
