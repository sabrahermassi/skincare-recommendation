/**
 * The signed-in shelf's sync rules (#223), as pure functions so the rules can
 * be tested without a network or a store.
 *
 * The server is the source of truth; the device keeps a cached copy in
 * `useAppStore` and a queue of changes made since the last sync. Every change
 * is applied to the cache first — the heart responds at once, with or without
 * signal — and queued; the queue is pushed when there is a connection, then
 * the server's shelf is read back and whatever is still queued is laid on top.
 *
 * **The conflict rule** (two devices editing offline):
 *
 * - Saves union. An item saved on either device ends up on the shelf.
 * - For an item saved on both, the **earliest** save time wins — it is when
 *   the person actually decided they liked it — and the formula version they
 *   saw then goes with it.
 * - A removal is explicit and beats any save made before it: a device that
 *   still has an item cached does not put it back, because only a *queued*
 *   save is ever pushed, never the cache itself.
 * - A save made after a removal is a new save, with its own time.
 */

import type { RoutineStep } from "@/lib/routine-step";

export type ShelfProduct = {
  id: string;
  savedAt: number;
  formulaFetchedAt?: string;
  /** The person's own routine step (#227); absent means "use the guess from the type". */
  routineStep?: RoutineStep;
  /** The person's journal note (#228), already trimmed; absent means none. */
  note?: string;
};

export type ShelfOp =
  | { kind: "save-product"; id: string; savedAt: number; formulaFetchedAt?: string }
  | { kind: "remove-product"; id: string }
  /** A routine step chosen, or cleared back to the guess (`null`). */
  | { kind: "set-product-step"; id: string; step: RoutineStep | null }
  /** A journal note written or edited, or deleted (`null`). */
  | { kind: "set-product-note"; id: string; note: string | null }
  | { kind: "save-ingredient"; name: string; savedAt: number }
  | { kind: "remove-ingredient"; name: string };

export type Shelf = {
  products: ShelfProduct[];
  /** Oldest first, the order the device appends them in. */
  ingredients: string[];
};

/** What one push has to do, once the queue is reduced to one outcome per item. */
export type ShelfPush = {
  /** Deleted outright: removed, or removed and then saved again (re-inserted below). */
  deleteProducts: string[];
  /**
   * Written as saves. `fresh` means a removal came first in this batch, so the
   * row is new and its time stands; otherwise an existing server row keeps
   * whichever save time is earlier.
   */
  saveProducts: (ShelfProduct & { fresh: boolean })[];
  /** Routine steps to write after the saves, the last choice per product. */
  productSteps: { id: string; step: RoutineStep | null }[];
  /** Journal notes to write after the saves, the last version per product. */
  productNotes: { id: string; note: string | null }[];
  deleteIngredients: string[];
  saveIngredients: { name: string; savedAt: number; fresh: boolean }[];
};

type Outcome<T> = { removed: boolean; save: T | null };

/** Reduces a queue to one outcome per item, in the order the ops happened. */
export function planPush(ops: readonly ShelfOp[]): ShelfPush {
  const products = new Map<string, Outcome<ShelfProduct>>();
  const steps = new Map<string, RoutineStep | null>();
  const notes = new Map<string, string | null>();
  const ingredients = new Map<string, Outcome<{ name: string; savedAt: number }>>();

  for (const op of ops) {
    if (op.kind === "set-product-step") {
      steps.set(op.id, op.step);
      continue;
    }
    if (op.kind === "set-product-note") {
      notes.set(op.id, op.note);
      continue;
    }
    // A removed row takes its step and note with it; one set after a
    // re-save comes later in the queue and is set again above.
    if (op.kind === "remove-product") {
      steps.delete(op.id);
      notes.delete(op.id);
    }
    if (op.kind === "save-product" || op.kind === "remove-product") {
      const prev = products.get(op.id) ?? { removed: false, save: null };
      products.set(
        op.id,
        op.kind === "remove-product"
          ? { removed: true, save: null }
          : // A second save of something already saved in this batch keeps
            // the first one's time, same as `saveProduct` does locally.
            { removed: prev.removed, save: prev.save ?? { id: op.id, savedAt: op.savedAt, formulaFetchedAt: op.formulaFetchedAt } },
      );
    } else {
      const prev = ingredients.get(op.name) ?? { removed: false, save: null };
      ingredients.set(
        op.name,
        op.kind === "remove-ingredient"
          ? { removed: true, save: null }
          : { removed: prev.removed, save: prev.save ?? { name: op.name, savedAt: op.savedAt } },
      );
    }
  }

  const push: ShelfPush = {
    deleteProducts: [],
    saveProducts: [],
    productSteps: [...steps].map(([id, step]) => ({ id, step })),
    productNotes: [...notes].map(([id, note]) => ({ id, note })),
    deleteIngredients: [],
    saveIngredients: [],
  };
  for (const [id, outcome] of products) {
    if (outcome.removed) push.deleteProducts.push(id);
    if (outcome.save) push.saveProducts.push({ ...outcome.save, fresh: outcome.removed });
  }
  for (const [name, outcome] of ingredients) {
    if (outcome.removed) push.deleteIngredients.push(name);
    if (outcome.save) push.saveIngredients.push({ ...outcome.save, fresh: outcome.removed });
  }
  return push;
}

/**
 * The shelf as the device should show it: `base` with `ops` applied in order.
 * Used to lay changes that are still queued over a shelf just read from the
 * server, so a save made mid-sync does not blink out.
 */
export function applyOps(base: Shelf, ops: readonly ShelfOp[]): Shelf {
  let products = base.products;
  let ingredients = base.ingredients;
  for (const op of ops) {
    switch (op.kind) {
      case "save-product":
        if (!products.some((p) => p.id === op.id)) {
          products = [...products, { id: op.id, savedAt: op.savedAt, formulaFetchedAt: op.formulaFetchedAt }];
        }
        break;
      case "remove-product":
        products = products.filter((p) => p.id !== op.id);
        break;
      case "set-product-step":
        products = products.map((p) =>
          p.id !== op.id ? p : op.step === null ? withoutStep(p) : { ...p, routineStep: op.step },
        );
        break;
      case "set-product-note":
        products = products.map((p) =>
          p.id !== op.id ? p : op.note === null ? withoutNote(p) : { ...p, note: op.note },
        );
        break;
      case "save-ingredient":
        if (!ingredients.includes(op.name)) ingredients = [...ingredients, op.name];
        break;
      case "remove-ingredient":
        ingredients = ingredients.filter((n) => n !== op.name);
        break;
    }
  }
  return { products, ingredients };
}

function withoutStep({ routineStep: _cleared, ...product }: ShelfProduct): ShelfProduct {
  return product;
}

function withoutNote({ note: _deleted, ...product }: ShelfProduct): ShelfProduct {
  return product;
}

/**
 * Every item on a shelf as a save — how a shelf from before accounts is
 * carried into one (#222). Pushed through the same rule as any save, so a
 * second phone's legacy shelf merges into an account that already has one,
 * keeping the earliest time per item and the formula version it was saved at.
 */
export function shelfAsSaves(shelf: Shelf, now: number): ShelfOp[] {
  return [
    ...shelf.products.map(
      (p): ShelfOp => ({ kind: "save-product", id: p.id, savedAt: p.savedAt, formulaFetchedAt: p.formulaFetchedAt }),
    ),
    ...shelf.products.flatMap((p): ShelfOp[] =>
      p.routineStep ? [{ kind: "set-product-step", id: p.id, step: p.routineStep }] : [],
    ),
    ...shelf.products.flatMap((p): ShelfOp[] => (p.note ? [{ kind: "set-product-note", id: p.id, note: p.note }] : [])),
    // Starred ingredients never recorded when they were starred; the device's
    // own order is kept by spacing them a millisecond apart.
    ...shelf.ingredients.map((name, i): ShelfOp => ({ kind: "save-ingredient", name, savedAt: now + i })),
  ];
}
