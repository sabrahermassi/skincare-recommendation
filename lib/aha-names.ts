/**
 * Alpha hydroxy acid names, shared between `lib/rules.ts` (scoring) and
 * `lib/context-nudges.ts` (the daytime-SPF nudge). One list for the same
 * reason `lib/retinoid-salicylate-names.ts` exists: two hand-copied lists of
 * the same actives drift, and the drift is invisible until a name added to
 * one is missing from the other (#186, #234).
 */
export const AHA_NAMES: string[] = [
  "glycolic acid",
  "lactic acid",
  "mandelic acid",
  "aha",
  "malic acid",
  "tartaric acid",
];
