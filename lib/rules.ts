import type { BaseSkinType, Concern, ProductType } from "@/data/types";

/**
 * Curated ingredient rules — the app's actual dermatological judgement.
 *
 * WHY THIS EXISTS AS A HAND-WRITTEN TABLE
 *
 * The catalogue gives us INCI names, functions and EU regulatory status, and
 * nothing about who a formula suits. Product-level `suitableFor`/`targets`
 * tags arrive empty from every real source, and CosIng rates no ingredient for
 * pore-clogging. So either the app buys per-ingredient ratings as a metered
 * external dependency, or it states its reasoning in a table it owns. This is
 * the second. Every row carries the sentence shown to the user, so any claim
 * the app makes can be traced to a line of code and argued with.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It covers the few dozen ingredients where the direction of effect is
 * uncontroversial. It is not a comedogenicity database: those published
 * 0–5 scales come from mid-century rabbit-ear assays, correlate poorly with
 * human breakouts, and are contested — the handful included here are the ones
 * with reasonably consistent human evidence, and they are weighted gently.
 * An ingredient absent from this table contributes nothing rather than being
 * scored as neutral-good.
 *
 * Names are matched against the same normalised lowercase form the label
 * parser produces (see `normalise` in the import scripts).
 */

export type RuleTarget = {
  skinTypes?: BaseSkinType[];
  concerns?: Concern[];
  /** Applies when the user flagged sensitive skin. */
  sensitive?: boolean;
};

/**
 * The named factor a rule contributes to. The result screen groups reasons by
 * this so the explanation reads as "Hydration +18 / Fragrance −12" rather than
 * a flat list of a dozen ingredients.
 */
export type RuleCategory =
  | "hydration"
  | "barrier"
  | "soothing"
  | "actives"
  | "fragrance"
  | "alcohol"
  | "irritants"
  | "pore-clogging";

export const CATEGORY_LABEL: Record<RuleCategory, string> = {
  hydration: "Hydration",
  barrier: "Barrier support",
  soothing: "Soothing",
  actives: "Active ingredients",
  fragrance: "Fragrance",
  alcohol: "Drying alcohol",
  irritants: "Known irritants",
  "pore-clogging": "Pore-clogging risk",
};

export type IngredientRule = {
  /** Normalised INCI names, or a pattern for a family. */
  names: (string | RegExp)[];
  category: RuleCategory;
  /** Who it helps. */
  helps?: RuleTarget;
  /** Who it works against. */
  hurts?: RuleTarget;
  /** Shown verbatim to the user. Say why, not just what. */
  reason: string;
  /**
   * Magnitude before position weighting, roughly 4 (mild) to 14 (decisive).
   * Kept small for anything contested.
   */
  weight: number;
};

export const INGREDIENT_RULES: IngredientRule[] = [
  // ── Hydration and barrier ─────────────────────────────────────────────────
  {
    names: ["glycerin", "glycerol"],
    category: "hydration",
    helps: { concerns: ["dehydrated"], skinTypes: ["dry"] },
    reason: "Glycerin draws water into the skin — the most evidenced humectant there is",
    weight: 8,
  },
  {
    names: ["sodium hyaluronate", "hyaluronic acid", "hydrolyzed hyaluronic acid"],
    category: "hydration",
    helps: { concerns: ["dehydrated"] },
    reason: "Hyaluronic acid holds water in the upper layers, which is what dehydrated skin lacks",
    weight: 8,
  },
  {
    names: [/^ceramide/, "phytosphingosine", "sphingolipids"],
    category: "barrier",
    helps: { skinTypes: ["dry"], sensitive: true, concerns: ["atopic"] },
    reason:
      "Ceramides rebuild the barrier lipids that dry, reactive and eczema-prone skin runs short of",
    weight: 10,
  },
  {
    names: ["panthenol", "dexpanthenol", "d-panthenol"],
    category: "barrier",
    helps: { concerns: ["redness", "atopic"], sensitive: true },
    reason: "Panthenol soothes and supports barrier repair — well tolerated on reactive skin",
    weight: 7,
  },

  // ── Eczema-prone skin ─────────────────────────────────────────────────────
  // What the dermo-cosmetic ranges built for it actually rely on: replace the
  // lipids, calm the itch, and leave out anything that sensitises.
  {
    names: [/^avena sativa/, "colloidal oatmeal", "oat kernel extract", "oat kernel oil"],
    category: "soothing",
    helps: { concerns: ["atopic", "redness"], sensitive: true },
    reason: "Colloidal oatmeal is the classic anti-itch barrier ingredient for eczema-prone skin",
    weight: 9,
  },
  {
    names: [/^butyrospermum/, "shea butter", /^helianthus annuus seed oil/, "canola oil"],
    category: "barrier",
    helps: { concerns: ["atopic"], skinTypes: ["dry"] },
    reason: "A rich plant lipid that replaces what an eczema-prone barrier leaks",
    weight: 7,
  },
  {
    names: [/^vitreoscilla/, "bifida ferment lysate", /^lactobacillus/, "aqua posae filiformis"],
    category: "soothing",
    helps: { concerns: ["atopic"], sensitive: true },
    reason: "Microbiome-derived ferments used in eczema-prone ranges to help calm reactivity",
    weight: 6,
  },
  {
    names: ["squalane", "squalene"],
    category: "barrier",
    helps: { skinTypes: ["dry"] },
    reason: "Squalane is a light emollient that softens without a heavy occlusive feel",
    weight: 6,
  },
  {
    names: ["urea"],
    category: "hydration",
    helps: { skinTypes: ["dry"], concerns: ["dehydrated"] },
    reason: "Urea both hydrates and gently loosens flaking on very dry skin",
    weight: 7,
  },
  {
    names: ["beta-glucan", "beta glucan", "sodium beta-sitosteryl sulfate"],
    category: "soothing",
    helps: { sensitive: true, concerns: ["redness"] },
    reason: "Beta-glucan calms irritation and supports repair",
    weight: 5,
  },
  {
    names: ["allantoin"],
    category: "soothing",
    helps: { sensitive: true, concerns: ["redness"] },
    reason: "Allantoin is a mild soother with a very low irritation profile",
    weight: 5,
  },

  // ── Soothing botanicals with real evidence ────────────────────────────────
  {
    names: [/centella/, "madecassoside", "asiaticoside", "asiatic acid", "madecassic acid"],
    category: "soothing",
    helps: { concerns: ["redness"], sensitive: true },
    reason: "Centella (cica) has good evidence for calming redness and supporting repair",
    weight: 8,
  },
  {
    names: ["bisabolol", "alpha-bisabolol"],
    category: "soothing",
    helps: { sensitive: true, concerns: ["redness"] },
    reason: "Bisabolol is an anti-irritant, the gentle fraction of chamomile",
    weight: 5,
  },
  {
    names: [/^glycyrrhiza/, "licorice root extract", "dipotassium glycyrrhizate"],
    category: "soothing",
    helps: { concerns: ["redness", "hyperpigmentation"] },
    reason: "Licorice root both calms redness and mildly evens tone",
    weight: 6,
  },
  {
    names: ["green tea extract", /^camellia sinensis/, "egcg"],
    category: "soothing",
    helps: { concerns: ["redness"], skinTypes: ["oily"] },
    reason: "Green tea polyphenols are antioxidant and mildly calming",
    weight: 5,
  },

  // ── Actives: tone, texture, ageing ────────────────────────────────────────
  {
    // One rule per ingredient: `findRule` takes the first match, so a second
    // niacinamide entry for eczema-prone skin would shadow this one and stop
    // it contributing for everybody else.
    names: ["niacinamide", "nicotinamide"],
    category: "barrier",
    helps: {
      concerns: ["large-pores", "hyperpigmentation", "redness", "atopic"],
      skinTypes: ["oily", "combination"],
    },
    reason: "Niacinamide moderates oil, evens tone and strengthens the barrier — unusually versatile",
    weight: 10,
  },
  {
    names: ["salicylic acid", "bha", "betaine salicylate"],
    category: "pore-clogging",
    helps: { concerns: ["acne-prone", "large-pores"], skinTypes: ["oily"] },
    hurts: { sensitive: true, skinTypes: ["dry"] },
    reason: "Salicylic acid clears pores from the inside — effective on congestion, drying on dry or reactive skin",
    weight: 10,
  },
  {
    names: ["glycolic acid", "lactic acid", "mandelic acid", "aha", "malic acid", "tartaric acid"],
    category: "actives",
    helps: { concerns: ["dullness", "hyperpigmentation"] },
    hurts: { sensitive: true },
    reason: "Alpha hydroxy acids resurface and brighten, at the cost of tolerance on reactive skin",
    weight: 8,
  },
  {
    names: ["retinol", "retinal", "retinaldehyde", "retinyl palmitate", "hydroxypinacolone retinoate", "adapalene"],
    category: "actives",
    helps: { concerns: ["fine-lines", "acne-prone", "hyperpigmentation"] },
    hurts: { sensitive: true, skinTypes: ["dry"] },
    reason: "Retinoids have the strongest evidence for lines and congestion, and the highest irritation cost",
    weight: 11,
  },
  {
    names: ["ascorbic acid", "l-ascorbic acid", "3-o-ethyl ascorbic acid", "ascorbyl glucoside", "magnesium ascorbyl phosphate"],
    category: "actives",
    helps: { concerns: ["dullness", "hyperpigmentation"] },
    hurts: { sensitive: true },
    reason: "Vitamin C brightens and protects against oxidative damage; the acidic forms can sting",
    weight: 8,
  },
  {
    names: ["alpha-arbutin", "arbutin", "tranexamic acid", "kojic acid", "ferulic acid"],
    category: "actives",
    helps: { concerns: ["hyperpigmentation", "dullness"] },
    reason: "Targets pigment production directly, without the irritation of an acid",
    weight: 8,
  },
  {
    names: ["azelaic acid", "potassium azeloyl diglycinate"],
    category: "actives",
    helps: { concerns: ["redness", "acne-prone", "hyperpigmentation"] },
    reason: "Azelaic acid is one of the few actives that suits redness and congestion at once",
    weight: 9,
  },
  {
    names: ["adenosine"],
    category: "actives",
    helps: { concerns: ["fine-lines"] },
    reason: "Adenosine is a well-tolerated smoothing active, common in Korean formulas",
    weight: 5,
  },
  {
    names: ["zinc pca", "zinc gluconate"],
    category: "actives",
    helps: { skinTypes: ["oily"], concerns: ["acne-prone", "large-pores"] },
    reason: "Zinc salts help moderate sebum",
    weight: 6,
  },

  // ── UV filters ────────────────────────────────────────────────────────────
  {
    names: ["zinc oxide", "titanium dioxide"],
    category: "actives",
    helps: { sensitive: true },
    reason: "Mineral UV filters sit on the surface and rarely provoke reactive skin",
    weight: 6,
  },

  // ── Irritants and drying agents ───────────────────────────────────────────
  {
    names: ["alcohol denat", "alcohol denat.", "denatured alcohol", "sd alcohol 40", "sd alcohol 40-b", "ethanol"],
    category: "alcohol",
    hurts: { skinTypes: ["dry"], sensitive: true, concerns: ["dehydrated", "atopic"] },
    reason: "Denatured alcohol gives a fast dry-down but strips a dry or compromised barrier",
    weight: 9,
  },
  {
    names: ["parfum", "fragrance", "aroma"],
    category: "fragrance",
    hurts: { sensitive: true, concerns: ["redness", "atopic"] },
    reason: "Fragrance is the most common cause of cosmetic contact reactions",
    weight: 9,
  },
  {
    names: [
      "limonene", "linalool", "citronellol", "geraniol", "eugenol", "coumarin",
      "citral", "benzyl salicylate", "benzyl benzoate", "hexyl cinnamal",
      "butylphenyl methylpropional", "isoeugenol", "farnesol",
    ],
    category: "fragrance",
    hurts: { sensitive: true, concerns: ["atopic"] },
    reason: "An EU-labelled fragrance allergen — declared precisely because it sensitises some people",
    weight: 6,
  },
  {
    names: [
      /lavandula/, /mentha/, "peppermint oil", /eucalyptus/, /citrus .*(peel oil|oil)/,
      "tea tree oil", /melaleuca/, /cymbopogon/, /rosmarinus/, "clove oil", /eugenia caryophyllus/,
    ],
    category: "fragrance",
    hurts: { sensitive: true, concerns: ["redness", "atopic"] },
    reason: "Volatile essential oil — pleasant, but a frequent irritant on reactive skin",
    weight: 7,
  },
  {
    names: ["menthol", "camphor", "menthyl lactate"],
    category: "irritants",
    hurts: { sensitive: true, concerns: ["redness", "atopic"] },
    reason: "Creates a cooling sensation by irritating nerve endings, not by soothing",
    weight: 7,
  },
  {
    names: ["sodium lauryl sulfate", "ammonium lauryl sulfate"],
    category: "irritants",
    hurts: { skinTypes: ["dry"], sensitive: true, concerns: ["atopic"] },
    reason: "A harsh primary surfactant — the standard irritant control in patch testing",
    weight: 8,
  },
  {
    names: ["sodium bicarbonate", "sodium hydroxide"],
    category: "irritants",
    hurts: { sensitive: true },
    reason: "Strongly alkaline; can push a formula away from skin's natural pH",
    weight: 4,
  },
  {
    names: [/hamamelis/, "witch hazel"],
    category: "irritants",
    hurts: { sensitive: true, skinTypes: ["dry"] },
    reason: "Witch hazel distillates are usually alcohol-carried and astringent",
    weight: 5,
  },

  // ── Pore-clogging: the contested ones, weighted gently ────────────────────
  {
    names: ["cocos nucifera oil", "coconut oil", "isopropyl myristate", "isopropyl palmitate", "myristyl myristate"],
    category: "pore-clogging",
    hurts: { concerns: ["acne-prone"], skinTypes: ["oily"] },
    reason: "Among the few ingredients with consistent human evidence for clogging pores",
    weight: 7,
  },
  {
    names: ["lauric acid", "oleth-3", "isopropyl isostearate", "butyl stearate"],
    category: "pore-clogging",
    hurts: { concerns: ["acne-prone"] },
    reason: "Commonly implicated in congestion on acne-prone skin",
    weight: 5,
  },
  {
    names: [/theobroma cacao/, "cocoa butter", "wheat germ oil", /triticum vulgare germ oil/],
    category: "pore-clogging",
    hurts: { concerns: ["acne-prone"] },
    reason: "A rich occlusive that tends to sit heavily on congestion-prone skin",
    weight: 5,
  },
];

/**
 * How much of an ingredient's effect survives the way the product is used.
 *
 * A cleanser is on the skin for perhaps a minute and is then rinsed off, so
 * both its actives and its irritants land far softer than the same names in a
 * serum left on all night. Scoring them identically overstated salicylic acid
 * in a face wash and, worse, overstated fragrance in one. Position already
 * proxies concentration; this proxies exposure, which is the other half.
 *
 * Not zero for rinse-off: surfactants and fragrance still cause real contact
 * reactions, which is why patch testing uses a wash-off protocol at all.
 */
export function contactWeight(type: ProductType): number {
  return type === "cleanser" || type === "body-wash" ? 0.4 : 1;
}

/**
 * INCI order is regulated: ingredients appear in descending concentration
 * (above 1%, after which order is free). So the same ingredient means very
 * different things at position 2 and position 30 — a fragrance high in the
 * list is a real exposure, the same word last is a trace.
 *
 * Nothing in the app used this before, and it is the single most informative
 * signal the catalogue actually carries.
 */
export function positionWeight(position: number): number {
  if (position <= 2) return 1;
  if (position <= 5) return 0.8;
  if (position <= 10) return 0.5;
  if (position <= 20) return 0.25;
  return 0.1;
}

/** Matches an ingredient name against a rule's name patterns. */
export function ruleMatches(rule: IngredientRule, inciName: string): boolean {
  const name = inciName.trim().toLowerCase();
  return rule.names.some((pattern) =>
    typeof pattern === "string" ? name === pattern : pattern.test(name)
  );
}

/** Whether a rule target applies to this profile. */
export function targetApplies(
  target: RuleTarget | undefined,
  profile: { baseSkinType: BaseSkinType | null; concerns: Concern[]; sensitive: boolean }
): boolean {
  if (!target) return false;
  if (target.sensitive && profile.sensitive) return true;
  if (target.skinTypes && profile.baseSkinType && target.skinTypes.includes(profile.baseSkinType)) {
    return true;
  }
  if (target.concerns && target.concerns.some((c) => profile.concerns.includes(c))) return true;
  return false;
}
