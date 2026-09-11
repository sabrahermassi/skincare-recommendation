import type { Ingredient } from "@/data/types";

/**
 * Pregnancy/breastfeeding-caution ingredients — a property of the formula,
 * not a score, following the same shape as `lib/pore-clogging.ts` and for the
 * same reason: whether a formula contains one of these is true or false
 * regardless of who's asking, so detection takes no profile and every
 * ingredient is checked with no truncation.
 *
 * Scope is deliberately narrow: the four categories with real clinical
 * consensus (ACOG and dermatology guidance agree on all four) rather than a
 * long list padded with contested or low-risk entries. Concentration is not
 * something an INCI name carries — salicylic acid at 0.5% (a rinse-off
 * cleanser) and at 2% (a leave-on treatment) are the same string on a label —
 * so these flag *presence*, and the reason text says so rather than implying
 * a precision the label doesn't support.
 *
 * This is disclosed as a caution, not a hazard: it feeds
 * `Contraindication.severity: "irritant"` in `lib/safety.ts`, the same
 * graduated tier restricted/commonly-reactive ingredients use, not the hard
 * `"hazard"` cap. Pregnancy skincare guidance is a judgment call for the
 * person and their doctor, not a formula defect.
 */

export type PregnancyCautionEntry = {
  names: (string | RegExp)[];
  category: "retinoid" | "salicylic-acid" | "hydroquinone" | "essential-oil";
  reason: string;
};

export const PREGNANCY_CAUTION: PregnancyCautionEntry[] = [
  {
    names: [
      "retinol",
      "retinal",
      "retinaldehyde",
      "tretinoin",
      "adapalene",
      "tazarotene",
      /^retinyl (palmitate|acetate|linoleate|propionate)$/,
    ],
    category: "retinoid",
    reason:
      "A vitamin A derivative — commonly advised against in pregnancy and while breastfeeding",
  },
  {
    names: ["salicylic acid", /^(sodium|potassium) salicylate$/, "willow bark extract"],
    category: "salicylic-acid",
    reason:
      "Salicylic acid — commonly flagged in pregnancy at leave-on concentrations; a label alone can't say how much is in this formula",
  },
  {
    names: ["hydroquinone"],
    category: "hydroquinone",
    reason: "Hydroquinone — commonly advised against in pregnancy and while breastfeeding",
  },
  {
    names: [
      /essential oil$/,
      /^(lavandula|citrus|mentha|rosmarinus|eucalyptus|melaleuca|cinnamomum|origanum|thymus|salvia) .*oil$/,
    ],
    category: "essential-oil",
    reason:
      "An essential oil — several common ones are advised against in pregnancy in concentrated form",
  },
];

function entryMatches(entry: PregnancyCautionEntry, inciName: string): boolean {
  const name = inciName.trim().toLowerCase();
  return entry.names.some((pattern) =>
    typeof pattern === "string" ? name === pattern : pattern.test(name)
  );
}

export type PregnancyCautionHit = {
  ingredient: Ingredient;
  reason: string;
};

/** Every pregnancy/breastfeeding-caution ingredient in a formula, label order. */
export function pregnancyCautionHits(ingredients: Ingredient[]): PregnancyCautionHit[] {
  const hits: PregnancyCautionHit[] = [];
  for (const ingredient of ingredients) {
    const entry = PREGNANCY_CAUTION.find((candidate) => entryMatches(candidate, ingredient.name));
    if (entry) hits.push({ ingredient, reason: entry.reason });
  }
  return hits;
}
