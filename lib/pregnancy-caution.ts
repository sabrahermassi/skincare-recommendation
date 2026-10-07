import type { Ingredient } from "@/data/types";
import type { RuleSource } from "./rules";
import {
  RETINOID_NAMES,
  RETINOID_PRESCRIPTION_NAMES,
  RETINYL_ESTER_PATTERN,
  RETINYL_RETINOATE_NAME,
  SALICYLATE_NAMES,
  SALICYLATE_FALLBACK_NAMES,
  SALICYLATE_SALT_PATTERN,
} from "./retinoid-salicylate-names";

/**
 * Pregnancy/breastfeeding-caution ingredients — a property of the formula,
 * not a score, following the same shape as `lib/pore-clogging.ts` and for the
 * same reason: whether a formula contains one of these is true or false
 * regardless of who's asking, so detection takes no profile and every
 * ingredient is checked with no truncation.
 *
 * Scope is deliberately narrow: the four categories that dermatology guidance
 * names (each cites the page that was opened and read, #475) rather than a
 * long list padded with contested or low-risk entries. Each says only what its
 * source says: the American Academy of Dermatology page covers pregnancy and
 * nothing on breastfeeding, so only hydroquinone, whose MotherSafe source also
 * says to avoid it while breastfeeding, says so. Arbutin is deliberately not
 * here (#475, owner, 7 October 2026): Skin needs hides it from pregnant
 * users (`lib/skin-needs-data.ts`), but there is no source to warn on a scan, and
 * this list does not warn without one. Revisit when an expert answers. Concentration is not
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

type PregnancyCautionEntry = {
  names: (string | RegExp)[];
  category: "retinoid" | "salicylic-acid" | "hydroquinone" | "essential-oil";
  reason: string;
  /** Where the caution comes from (#326) — same rules as `IngredientRule.source`. */
  source?: RuleSource;
};

export const PREGNANCY_CAUTION: PregnancyCautionEntry[] = [
  {
    names: [...RETINOID_NAMES, ...RETINOID_PRESCRIPTION_NAMES, RETINYL_ESTER_PATTERN, RETINYL_RETINOATE_NAME],
    category: "retinoid",
    reason: "A vitamin A derivative — commonly advised against in pregnancy",
    // "Avoid … retinoids", prescription and over-the-counter alike (read 7 October 2026).
    source: {
      label: "American Academy of Dermatology: pregnancy skin care",
      url: "https://www.aad.org/public/everyday-care/skin-care-secrets/routine/pregnancy-skin-care",
    },
  },
  {
    names: [...SALICYLATE_NAMES, SALICYLATE_SALT_PATTERN, ...SALICYLATE_FALLBACK_NAMES],
    category: "salicylic-acid",
    reason:
      "Salicylic acid — guidance is to limit strengths above 2% in pregnancy; a label alone can't say how much is in this formula",
    // "Salicylic acid at high doses (greater than 2%)" is to be used sparingly, after talking to a dermatologist (read 7 October 2026).
    source: {
      label: "American Academy of Dermatology: pregnancy skin care",
      url: "https://www.aad.org/public/everyday-care/skin-care-secrets/routine/pregnancy-skin-care",
    },
  },
  {
    names: ["hydroquinone"],
    category: "hydroquinone",
    // MotherSafe: avoid hydroquinone in pregnancy, and "while breastfeeding … as the absorption is high" (read 7 October 2026).
    reason: "Hydroquinone — commonly advised against in pregnancy and while breastfeeding",
    source: {
      label: "NSW Health MotherSafe",
      url: "https://www.seslhd.health.nsw.gov.au/sites/default/files/groups/Royal_Hospital_for_Women/Mothersafe/documents/skinhaircareandcosmetictreatmentsapril2021.pdf",
    },
  },
  {
    names: [
      /essential oil$/,
      /^(lavandula|citrus|mentha|rosmarinus|eucalyptus|melaleuca|cinnamomum|origanum|thymus|salvia|ocimum|jasminum) .*oil$/,
    ],
    category: "essential-oil",
    // The AAD page lists "essential oils, including rosemary, basil, jasmine, and sage oils" among the ingredients to
    // "discuss with your dermatologist and limit how often you use them during pregnancy" (read 7 October 2026). It says
    // limit, not avoid, so this does not say "advised against". Softened from the earlier wording by the owner, 7 October 2026.
    reason: "An essential oil — some, such as rosemary, basil, jasmine and sage, are best limited in pregnancy; ask your doctor or midwife",
    source: {
      label: "American Academy of Dermatology: pregnancy skin care",
      url: "https://www.aad.org/public/everyday-care/skin-care-secrets/routine/pregnancy-skin-care",
    },
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
  source?: RuleSource;
};

/** Every pregnancy-caution ingredient in a formula, label order. */
export function pregnancyCautionHits(ingredients: Ingredient[]): PregnancyCautionHit[] {
  const hits: PregnancyCautionHit[] = [];
  for (const ingredient of ingredients) {
    const entry = PREGNANCY_CAUTION.find((candidate) => entryMatches(candidate, ingredient.name));
    if (entry) hits.push({ ingredient, reason: entry.reason, source: entry.source });
  }
  return hits;
}
