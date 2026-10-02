import { useSyncExternalStore } from "react";

import { fetchProducts } from "@/data/api";
import { matchProduct } from "@/lib/matching";
import { isVerified } from "@/lib/safety";
import { HISTORY_LIMIT, useAppStore } from "@/store/useAppStore";

/**
 * Test data for trying long lists on a development build (owner, 2 October
 * 2026): 50 saved products, 50 in History, 50 starred ingredients, and a
 * ten-step routine. Development only: every caller is behind `__DEV__`, which
 * a release build compiles away, so none of this reaches a real user.
 *
 * The products and ingredients are real ones from the catalogue, saved through
 * the store's own actions, so the lists behave exactly as they would for
 * someone who had saved that many.
 */

const COUNT = 50;

/** Ten steps each way, so the routine has something to scroll. Names only: there is no advice behind them. */
export const TEST_STEPS = {
  morning: ["Cleansing", "Toner", "Essence", "Serum", "Eye cream", "Spot treatment", "Moisturiser", "Face oil", "Sunscreen", "Lip care"],
  evening: ["Oil cleanser", "Cleansing", "Exfoliant", "Toner", "Essence", "Treatment", "Serum", "Eye cream", "Moisturiser", "Night care"],
} as const;

// In memory only: the long routine lasts until the app reloads. The lists are
// in the store, so they stay.
let testRoutine = false;
const listeners = new Set<() => void>();
function setTestRoutine(on: boolean) {
  testRoutine = on;
  listeners.forEach((listener) => listener());
}

/** Whether the routine shows `TEST_STEPS`. Always false outside development. */
export function useTestRoutine(): boolean {
  const on = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => testRoutine,
  );
  return __DEV__ && on;
}

/** Fills Saved, History and the starred ingredients, and switches the routine to ten steps. Says how many of each it managed. */
export async function fillTestData(): Promise<{ saved: number; history: number; ingredients: number }> {
  const products = await fetchProducts();
  const store = useAppStore.getState();

  const toSave = products.slice(0, COUNT);
  for (const product of toSave) store.saveProduct(product.id, product.fetchedAt);

  // Oldest first, so the list ends up in catalogue order with the first on top.
  const toView = products.slice(COUNT, COUNT + Math.min(COUNT, HISTORY_LIMIT)).reverse();
  for (const product of toView) {
    const match = matchProduct(product, store.profile);
    store.recordView({ id: product.id, known: true, score: match.score, warnings: match.warnings.length, source: "opened" });
  }

  const names: string[] = [];
  for (const product of products) {
    for (const ingredient of product.ingredients) {
      if (names.length < COUNT && isVerified(ingredient) && !names.includes(ingredient.name)) names.push(ingredient.name);
    }
    if (names.length >= COUNT) break;
  }
  for (const name of names) store.saveIngredient(name);

  setTestRoutine(true);
  return { saved: toSave.length, history: toView.length, ingredients: names.length };
}

/** Empties Saved, History and the starred ingredients (everything in them, not only the test rows) and puts the routine back. */
export function clearTestData(): void {
  const store = useAppStore.getState();
  store.clearSavedProducts();
  store.clearSavedIngredients();
  store.clearHistory();
  setTestRoutine(false);
}
