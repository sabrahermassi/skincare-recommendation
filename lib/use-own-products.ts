import { useEffect, useState } from "react";

import { fetchProductsByIds } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";

/**
 * Products by id, read through the data seam (almost always straight from the
 * catalogue already on the device): the routine's own picks. One the
 * catalogue no longer has is simply not there.
 */
export function useOwnProducts(ids: readonly string[]): { found: ReadonlyMap<string, ProductWithIngredients>; /** The ids this answer is for; until it matches, nothing is known yet. */ settledFor: string; wanted: string } {
  const [answer, setAnswer] = useState<{ found: ReadonlyMap<string, ProductWithIngredients>; settledFor: string }>(() => ({ found: new Map(), settledFor: "" }));
  const wanted = [...new Set(ids)].sort().join(",");
  useEffect(() => {
    if (wanted === "") return;
    let cancelled = false;
    const settle = (products: ProductWithIngredients[]) => !cancelled && setAnswer({ found: new Map(products.map((product) => [product.id, product])), settledFor: wanted });
    fetchProductsByIds(wanted.split(",")).then(
      (result) => settle(result.ok ? result.value : []),
      () => settle([]),
    );
    return () => {
      cancelled = true;
    };
  }, [wanted]);
  return { ...answer, wanted };
}
