import { fetchProducts } from "@/data/api";
import type { ProductWithIngredients, SkinProfile } from "@/data/types";
import { assembleRoutine, recallRoutine, rememberRoutine, routineCandidates, routinePick, type Routine, type RoutinePick } from "@/lib/routine-builder";

// How many products are scored between two chances for a tap to be handled.
const SCORE_BATCH = 25;

/**
 * Gets the routine for a profile ready, and calls `onReady` with it: the one
 * remembered for that very profile and catalogue, or a new one.
 *
 * A new one is built in small batches. Scoring the catalogue in one go froze
 * the app for as long as it took (owner, 2 October 2026), so each batch
 * leaves room for a tap before the next. A catalogue that cannot be read
 * still gives a routine: its steps, with nothing picked.
 *
 * Returns a way to call it off. Two screens use this: the routine itself, and
 * the skin quiz's closing screen, which waits on it so the routine is there
 * the moment it opens.
 */
export function prepareRoutine(profile: SkinProfile, onReady: (routine: Routine) => void): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const build = (products: ProductWithIngredients[]) => {
    if (cancelled) return;
    const remembered = recallRoutine(profile, products);
    if (remembered) return onReady(remembered);

    const candidates = routineCandidates(products);
    const picks: RoutinePick[] = [];
    let next = 0;
    const batch = () => {
      if (cancelled) return;
      const end = Math.min(next + SCORE_BATCH, candidates.length);
      for (; next < end; next++) {
        const pick = routinePick(candidates[next], profile);
        if (pick) picks.push(pick);
      }
      if (next < candidates.length) {
        timer = setTimeout(batch, 0);
        return;
      }
      const routine = assembleRoutine(picks, profile);
      rememberRoutine(profile, products, routine);
      onReady(routine);
    };
    timer = setTimeout(batch, 0);
  };

  fetchProducts().then(build, () => build([]));
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
