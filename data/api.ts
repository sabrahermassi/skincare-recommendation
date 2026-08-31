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

/** Simulated latency, so loading states are exercised in the demo. */
const LATENCY_MS = 180;

function delay<T>(value: T): Promise<T> {
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

export async function fetchProducts(
  filters: ProductFilters = {}
): Promise<Product[]> {
  const { type = "all" } = filters;
  const results =
    type === "all" ? PRODUCTS : PRODUCTS.filter((p) => p.type === type);
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
