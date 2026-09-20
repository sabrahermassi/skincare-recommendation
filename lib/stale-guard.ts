/**
 * Tells a request's answer whether it is still wanted. `begin()` starts a request
 * and hands back its token; when the answer arrives, `isCurrent(token)` is false if
 * a newer request has started since, or if `invalidate()` was called (the screen was
 * left) — and the answer is dropped instead of repopulating a screen the person has
 * moved on from, or overwriting what a newer request already put there.
 */
export function createStaleGuard() {
  let generation = 0;
  return {
    begin: () => ++generation,
    isCurrent: (token: number) => token === generation,
    /** Everything in flight is now stale. */
    invalidate: () => {
      generation += 1;
    },
  };
}

export type StaleGuard = ReturnType<typeof createStaleGuard>;
