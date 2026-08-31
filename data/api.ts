import { INGREDIENTS } from "./ingredients";
import { PRODUCTS } from "./products";
import type {
  Ingredient,
  Product,
  ProductType,
  ProductWithIngredients,
} from "./types";

/**
 * THE SWAP POINT.
 *
 * Every screen reads catalog data through these functions and nothing else —
 * no component imports `products.ts` or `ingredients.ts` directly. To go live,
 * reimplement this file against a real endpoint; the signatures are already
 * async so no caller has to change.
 */

/**
 * Simulated latency, so loading states are exercised while developing.
 *
 * Development only: it must never delay a real network call in production,
 * and must not run under test, where pending timers slow the suite and leave
 * Jest workers hanging at teardown.
 */
const IS_TEST =
  typeof process !== "undefined" && process.env?.NODE_ENV === "test";
const LATENCY_MS =
  !IS_TEST && typeof __DEV__ !== "undefined" && __DEV__ ? 180 : 0;

function delay<T>(value: T): Promise<T> {
  if (LATENCY_MS === 0) return Promise.resolve(value);
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function resolveIngredients(product: Product): ProductWithIngredients {
  return {
    ...product,
    ingredients: product.ingredientIds.map(
      (id): Ingredient =>
        INGREDIENTS[id] ?? {
          id,
          name: id,
          comedogenic: 0,
          safety: "caution",
          note: "No data for this ingredient yet.",
        }
    ),
  };
}

export type ProductFilters = {
  type?: ProductType | "all";
};

/**
 * Returns products with ingredients resolved. The list screen needs them:
 * scoring reads the formula, not just the product-level tags, so that a
 * product whose INCI list contradicts its marketing cannot be surfaced as a
 * good match. A real backend would either embed these or expose a companion
 * endpoint — either way the caller signature stays the same.
 */
export async function fetchProducts(
  filters: ProductFilters = {}
): Promise<ProductWithIngredients[]> {
  const { type = "all" } = filters;
  const results = (
    type === "all" ? PRODUCTS : PRODUCTS.filter((p) => p.type === type)
  ).map(resolveIngredients);
  return delay(results);
}

export async function fetchProduct(
  id: string
): Promise<ProductWithIngredients | null> {
  const product = PRODUCTS.find((p) => p.id === id);
  return delay(product ? resolveIngredients(product) : null);
}

/** Used by the compare screen, which needs two resolved products at once. */
export async function fetchProductsByIds(
  ids: string[]
): Promise<ProductWithIngredients[]> {
  const results = ids
    .map((id) => PRODUCTS.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p))
    .map(resolveIngredients);
  return delay(results);
}

/** Distinct product types present in the catalog, for the filter bar. */
export async function fetchProductTypes(): Promise<ProductType[]> {
  return delay([...new Set(PRODUCTS.map((p) => p.type))]);
}
