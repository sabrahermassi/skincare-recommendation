import type { BaseSkinType, Concern, ProductType } from "@/data/types";
import { AHA_NAMES } from "./aha-names";
import { MINERAL_UV_FILTER_NAMES } from "./uv-filter-names";
import {
  RETINOID_NAMES,
  RETINYL_PALMITATE_NAME,
  RETINYL_RETINOATE_NAME,
  SALICYLATE_NAMES,
  SALICYLATE_ABBREVIATION_NAMES,
  BENZYL_SALICYLATE_NAME,
} from "./retinoid-salicylate-names";

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
  /**
   * Where the claim in `reason` comes from (#326), shown as "Source: <label>"
   * under it. Only a page that was opened and read as supporting this exact
   * claim — a regulator, an expert panel, a dermatology reference or a
   * peer-reviewed paper; never a blog, brand or retailer. A rule without one
   * is listed in `UNSOURCED_RULES` (`__tests__/rule-sources.test.ts`).
   */
  source?: RuleSource;
};

/** A citation for a claim the app makes: what to call it, and where it is. */
export type RuleSource = { label: string; url: string };

export const INGREDIENT_RULES: IngredientRule[] = [
  // ── Hydration and barrier ─────────────────────────────────────────────────
  {
    names: ["glycerin", "glycerol"],
    category: "hydration",
    helps: { concerns: ["dehydrated"], skinTypes: ["dry"] },
    reason: "Glycerin draws water into the skin - the most evidenced humectant there is",
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
      "Ceramides supply barrier lipids that dry, reactive and eczema-prone skin can run short of",
    weight: 10,
    source: { label: "International Journal of Cosmetic Science review, 2024", url: "https://pubmed.ncbi.nlm.nih.gov/39113291/" },
  },
  {
    names: ["panthenol", "dexpanthenol", "d-panthenol"],
    category: "barrier",
    helps: { concerns: ["redness", "atopic"], sensitive: true },
    reason: "Panthenol soothes and supports the skin barrier - well tolerated on reactive skin",
    weight: 7,
  },

  // ── Eczema-prone skin ─────────────────────────────────────────────────────
  // What the dermo-cosmetic ranges built for it actually rely on: replace the
  // lipids, calm the itch, and leave out anything that sensitises.
  {
    names: [/^avena sativa/, "colloidal oatmeal", "oat kernel extract", "oat kernel oil"],
    category: "soothing",
    helps: { concerns: ["atopic", "redness"], sensitive: true },
    reason: "Colloidal oatmeal is a classic comforting barrier ingredient for eczema-prone skin",
    weight: 9,
    source: { label: "Journal of Drugs in Dermatology trial, 2020", url: "https://pubmed.ncbi.nlm.nih.gov/32484623/" },
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

  // ── The everyday base of a formula ────────────────────────────────────────
  // Chosen by how often they actually appear in the catalogue, not by how
  // interesting they are. Before these, an oily or pigmentation-focused profile
  // met nothing the table had an opinion on in roughly half of all products —
  // the actives those profiles care about are simply absent from most jars,
  // and what remains is emollients, humectants and occlusives. Those are not
  // neutral to them, they are just quiet. All weighted low: none of these
  // decides a formula on its own.
  {
    names: ["cholesterol"],
    category: "barrier",
    helps: { skinTypes: ["dry"], sensitive: true, concerns: ["atopic"] },
    reason: "Cholesterol is one of the three lipids skin builds its barrier from",
    weight: 7,
    source: { label: "International Journal of Cosmetic Science review, 2024", url: "https://pubmed.ncbi.nlm.nih.gov/39113291/" },
  },
  {
    names: ["tocopherol", "tocopheryl acetate", "vitamin e"],
    category: "actives",
    helps: { concerns: ["dullness", "fine-lines"] },
    reason: "Vitamin E is an antioxidant that limits day-to-day oxidative damage",
    weight: 4,
  },
  {
    names: ["dimethicone", "cyclopentasiloxane", "dimethiconol"],
    category: "barrier",
    helps: { skinTypes: ["dry"], concerns: ["dehydrated"] },
    hurts: { concerns: ["acne-prone"] },
    reason:
      "Silicone smooths and slows water loss, though a heavier occlusive layer can trap congestion",
    weight: 5,
    source: { label: "DermNet: emollients and moisturisers", url: "https://dermnetnz.org/topics/emollients-and-moisturisers" },
  },
  {
    names: ["caprylic/capric triglyceride", "caprylic capric triglyceride", "tricaprylin"],
    category: "barrier",
    helps: { skinTypes: ["dry"] },
    reason: "A light coconut-derived emollient - softens without much weight",
    weight: 5,
  },
  {
    names: ["cetearyl alcohol", "cetyl alcohol", "stearyl alcohol", "behenyl alcohol"],
    category: "barrier",
    helps: { skinTypes: ["dry"] },
    hurts: { concerns: ["acne-prone"] },
    reason:
      "A fatty alcohol - softening rather than drying, despite the name, but rich on congestion-prone skin",
    weight: 4,
  },
  {
    names: ["butylene glycol", "propanediol", "pentylene glycol", "1,2-hexanediol", "dipropylene glycol"],
    category: "hydration",
    helps: { concerns: ["dehydrated"] },
    reason: "A humectant solvent - carries actives and holds a little water in the skin",
    // Measured at 100 of 104 real products, the single most common family in
    // the catalogue — formulas routinely carry two or three of them at once,
    // each scored separately by position. At weight 4 that stacks to roughly
    // +9-10 on its own, which is most of the way from BASE_SCORE to "good"
    // before any other ingredient is considered. Weight 2 keeps the direction
    // (still a real, if minor, positive for dehydrated skin) without letting
    // solvent content alone carry the verdict.
    weight: 2,
  },
  {
    names: ["palmitic acid", "stearic acid", "myristic acid"],
    category: "pore-clogging",
    hurts: { concerns: ["acne-prone"] },
    reason: "A heavier fatty acid, commonly implicated in congestion",
    weight: 5,
  },
  {
    names: ["fructooligosaccharides", "xylitol", "rhamnose", "inulin", "alpha-glucan oligosaccharide"],
    category: "soothing",
    helps: { sensitive: true, concerns: ["atopic"] },
    reason: "A prebiotic sugar - feeds the skin's own flora rather than acting on the skin directly",
    weight: 4,
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
    reason: "Beta-glucan calms irritation and supports the skin barrier",
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
    // Cica is the backbone of Korean blemish ranges as well as the calming
    // ones — it suits inflamed, breakout-prone skin for the same reason it
    // suits reactive skin.
    helps: { concerns: ["redness", "acne-prone"], sensitive: true },
    reason: "Centella (cica) has good evidence for calming the look of redness and supporting skin comfort",
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
    helps: { concerns: ["redness", "hyperpigmentation", "post-acne-marks"] },
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
      concerns: ["large-pores", "hyperpigmentation", "redness", "atopic", "post-acne-marks"],
      skinTypes: ["oily", "combination"],
    },
    reason: "Niacinamide moderates oil, evens tone and strengthens the barrier - unusually versatile",
    weight: 10,
    source: { label: "DermNet: nicotinamide", url: "https://dermnetnz.org/topics/nicotinamide" },
  },
  {
    names: [...SALICYLATE_NAMES, ...SALICYLATE_ABBREVIATION_NAMES],
    category: "pore-clogging",
    helps: { concerns: ["acne-prone", "large-pores"], skinTypes: ["oily"] },
    hurts: { sensitive: true, skinTypes: ["dry"] },
    reason: "Salicylic acid clears pores from the inside - effective on congestion, drying on dry or reactive skin",
    weight: 10,
    source: { label: "DermNet: salicylic acid", url: "https://dermnetnz.org/topics/salicylic-acid" },
  },
  {
    names: [...AHA_NAMES],
    category: "actives",
    helps: { concerns: ["dullness", "hyperpigmentation", "post-acne-marks"] },
    hurts: { sensitive: true },
    reason: "Alpha hydroxy acids resurface and brighten, at the cost of tolerance on reactive skin",
    weight: 8,
    source: { label: "US FDA: alpha hydroxy acids", url: "https://www.fda.gov/cosmetics/cosmetic-ingredients/alpha-hydroxy-acids" },
  },
  {
    names: [...RETINOID_NAMES],
    category: "actives",
    helps: { concerns: ["fine-lines", "acne-prone", "hyperpigmentation"] },
    hurts: { sensitive: true, skinTypes: ["dry"] },
    reason: "Retinoids have the strongest evidence for lines and congestion, and the highest irritation cost",
    weight: 11,
    source: { label: "DermNet: topical retinoids", url: "https://dermnetnz.org/topics/topical-retinoids" },
  },
  {
    names: [RETINYL_PALMITATE_NAME],
    category: "actives",
    helps: { concerns: ["fine-lines", "hyperpigmentation"] },
    reason: "Retinyl palmitate is a retinoid ester that must be converted in skin before it can act",
    weight: 5,
  },
  {
    names: [RETINYL_RETINOATE_NAME],
    category: "actives",
    helps: { concerns: ["fine-lines", "hyperpigmentation"] },
    hurts: { sensitive: true, skinTypes: ["dry"] },
    reason:
      "A retinoid ester with early trial evidence rivaling retinol for fine lines, at a gentler irritation cost than retinol itself",
    weight: 8,
  },
  {
    names: ["ascorbic acid", "l-ascorbic acid"],
    category: "actives",
    helps: { concerns: ["dullness", "hyperpigmentation", "post-acne-marks"] },
    hurts: { sensitive: true },
    reason: "Vitamin C brightens and protects against oxidative damage; the acidic forms can sting",
    weight: 8,
  },
  {
    names: ["3-o-ethyl ascorbic acid", "ascorbyl glucoside", "magnesium ascorbyl phosphate"],
    category: "actives",
    helps: { concerns: ["dullness", "hyperpigmentation", "post-acne-marks"] },
    reason: "A stable vitamin C derivative, distinct from acidic L-ascorbic acid",
    weight: 6,
  },
  {
    names: ["alpha-arbutin", "arbutin", "tranexamic acid", "kojic acid", "ferulic acid"],
    category: "actives",
    helps: { concerns: ["hyperpigmentation", "dullness", "post-acne-marks"] },
    reason: "Targets pigment production directly, without the irritation of an acid",
    weight: 8,
  },
  {
    names: ["azelaic acid", "potassium azeloyl diglycinate"],
    category: "actives",
    helps: { concerns: ["redness", "acne-prone", "hyperpigmentation", "post-acne-marks"] },
    reason: "Azelaic acid is one of the few actives that suits redness and congestion at once",
    weight: 9,
    source: { label: "DermNet: azelaic acid", url: "https://dermnetnz.org/topics/azelaic-acid" },
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
    names: [...MINERAL_UV_FILTER_NAMES],
    category: "actives",
    helps: { sensitive: true },
    reason: "Mineral UV filters sit on the surface and rarely provoke reactive skin",
    weight: 6,
    source: { label: "DermNet: sunscreens", url: "https://dermnetnz.org/topics/topical-sunscreen-agents" },
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
    source: { label: "DermNet: contact reactions to cosmetics", url: "https://dermnetnz.org/topics/contact-reactions-to-cosmetics" },
  },
  {
    names: [
      "limonene", "linalool", "citronellol", "geraniol", "eugenol", "coumarin",
      "citral", BENZYL_SALICYLATE_NAME, "benzyl benzoate", "hexyl cinnamal",
      "butylphenyl methylpropional", "isoeugenol", "farnesol",
    ],
    category: "fragrance",
    hurts: { sensitive: true, concerns: ["atopic"] },
    // benzyl salicylate above is a fragrance allergen (an ester of benzyl
    // alcohol), not a salicylic-acid source — kept out of SALICYLATE_NAMES
    // on purpose, see lib/retinoid-salicylate-names.ts.
    reason: "An EU-labelled fragrance allergen - declared precisely because it sensitises some people",
    weight: 6,
    source: { label: "DermNet: fragrance allergy", url: "https://dermnetnz.org/topics/fragrance-allergy" },
  },
  {
    // Tea tree is pulled out of the essential-oil family below and listed
    // FIRST, because `findRule` takes the first match: left in that group it
    // would only ever read as an irritant, and its anti-blemish evidence —
    // the reason it is in half the acne products on the shelf — could never
    // fire. Both are true at once, which the engine already supports (see
    // salicylic acid), and the net effect is what moves the score.
    names: ["tea tree oil", /^melaleuca/],
    category: "actives",
    helps: { concerns: ["acne-prone"] },
    hurts: { sensitive: true, concerns: ["atopic"] },
    reason:
      "Tea tree oil has real evidence against blemishes, and is a common irritant on reactive skin",
    weight: 7,
  },
  {
    names: [
      /lavandula/, /mentha/, "peppermint oil", /eucalyptus/, /citrus .*(peel oil|oil)/,
      /cymbopogon/, /rosmarinus/, "clove oil", /eugenia caryophyllus/,
    ],
    category: "fragrance",
    hurts: { sensitive: true, concerns: ["redness", "atopic"] },
    reason: "Volatile essential oil - pleasant, but a frequent irritant on reactive skin",
    weight: 7,
    source: { label: "DermNet: contact allergy to essential oils", url: "https://dermnetnz.org/topics/allergic-contact-dermatitis-to-essential-oils" },
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
    reason: "A harsh primary surfactant - the standard irritant control in patch testing",
    weight: 8,
    source: { label: "Contact Dermatitis study, 2003", url: "https://pubmed.ncbi.nlm.nih.gov/12694214/" },
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

  // ── Blemish-prone skin ────────────────────────────────────────────────────
  // Measured before these were added: for an acne-prone profile the median
  // real formula produced ZERO positive evidence, so no product could ever
  // read as a good match however gentle it was. Pore-clogging detection
  // (lib/pore-clogging.ts) answers "will this cause breakouts"; these answer
  // the other half, "does anything here actually help".
  {
    names: ["sulfur", "colloidal sulfur"],
    category: "actives",
    helps: { concerns: ["acne-prone"], skinTypes: ["oily"] },
    hurts: { skinTypes: ["dry"] },
    reason:
      "Sulfur absorbs surface oil and loosens flakes - a long-used option in blemish care",
    weight: 8,
  },
  {
    names: ["benzoyl peroxide"],
    category: "actives",
    helps: { concerns: ["acne-prone"] },
    hurts: { sensitive: true, skinTypes: ["dry"] },
    reason:
      "Benzoyl peroxide is a strong blemish active with a high drying and irritation cost",
    weight: 12,
  },
  {
    names: ["kaolin", "bentonite", "montmorillonite", "silica", "solum fullonum"],
    category: "actives",
    helps: { skinTypes: ["oily"], concerns: ["large-pores", "acne-prone"] },
    reason: "An absorbent clay that lifts surface oil - a shiny T-zone looks less congested",
    weight: 6,
  },
  {
    names: [/^houttuynia/],
    category: "soothing",
    helps: { concerns: ["acne-prone", "redness"], sensitive: true },
    reason: "Houttuynia is the calming anti-blemish botanical Korean acne ranges are built around",
    weight: 6,
  },
  {
    names: [/^propolis/, "bee propolis"],
    category: "actives",
    helps: { concerns: ["acne-prone"] },
    reason: "Propolis is a soothing resin commonly used in Korean blemish care",
    weight: 5,
  },
  {
    names: ["capryloyl glycine"],
    category: "actives",
    helps: { concerns: ["acne-prone", "large-pores"], skinTypes: ["oily"] },
    reason: "Capryloyl glycine helps moderate sebum on blemish-prone skin",
    weight: 5,
  },
  {
    names: ["lauroyl lysine", "sarcosine", "sodium cocoyl alaninate"],
    category: "actives",
    helps: { concerns: ["large-pores"], skinTypes: ["oily"] },
    reason: "Helps moderate oil and refine the look of pores",
    weight: 4,
  },

  // ── Dullness and fine lines ───────────────────────────────────────────────
  // The other two starved concerns: 1.6 and 1.9 points of evidence available
  // at the 75th percentile before these.
  {
    names: ["bakuchiol"],
    category: "actives",
    helps: { concerns: ["fine-lines", "acne-prone"] },
    reason: "Bakuchiol gives retinol-like smoothing with far less irritation - the gentle alternative",
    weight: 7,
    source: { label: "British Journal of Dermatology trial, 2019", url: "https://pubmed.ncbi.nlm.nih.gov/29947134/" },
  },
  {
    names: ["ubiquinone", "coenzyme q-10", "ubiquinol"],
    category: "actives",
    helps: { concerns: ["fine-lines", "dullness"] },
    reason: "CoQ10 is an antioxidant skin makes less of with age",
    weight: 5,
  },
  {
    names: ["resveratrol", "polygonum cuspidatum root extract"],
    category: "actives",
    helps: { concerns: ["fine-lines", "dullness"] },
    reason: "Resveratrol is a plant antioxidant that limits day-to-day oxidative damage",
    weight: 5,
  },
  {
    names: ["glutathione"],
    category: "actives",
    helps: { concerns: ["hyperpigmentation", "dullness"] },
    reason: "Glutathione is the brightening antioxidant Korean tone-care is built on",
    weight: 6,
  },
  {
    names: [
      /^palmitoyl (tri|penta|hexa|oligo)peptide/, "acetyl hexapeptide-8",
      "copper tripeptide-1", /^sh-oligopeptide/, /^sh-polypeptide/,
    ],
    category: "actives",
    helps: { concerns: ["fine-lines"] },
    reason: "A signal peptide used to support firmer-looking skin",
    weight: 5,
  },
  {
    names: [/^panax ginseng/, "ginseng root extract"],
    category: "actives",
    helps: { concerns: ["fine-lines", "dullness"] },
    reason: "Ginseng is antioxidant and circulation-boosting, an anchor of Korean anti-ageing formulas",
    weight: 5,
  },

  // ── Gentle surfactants ────────────────────────────────────────────────────
  // Cleansers previously collected no positive signal at all: the table knew
  // how to punish a harsh surfactant and had nothing to say about a mild one,
  // so every wash read as neutral at best.
  {
    names: [
      "sodium cocoyl isethionate", "sodium methyl cocoyl taurate", "sodium lauroyl lactylate",
      "coco-betaine", "disodium cocoamphodiacetate", "lauryl glucoside", "decyl glucoside",
      "coco-glucoside", "sodium lauroyl sarcosinate",
    ],
    category: "soothing",
    helps: { sensitive: true, skinTypes: ["dry"], concerns: ["atopic"] },
    reason: "A mild surfactant chosen to clean without stripping - much gentler than a sulfate",
    weight: 4,
  },
];

/**
 * Layer 2 — CosIng functional roles, for the ~83% of catalogue ingredients
 * that carry them. Nothing scored on these before; they were a UI subtitle.
 *
 * WHY BENEFIT ONLY
 *
 * These are per-INGREDIENT capability lists, not per-formula roles. Measured
 * across the catalogue, "perfuming" tags 83% of products and "denaturant"
 * 75%, because botanical extracts and solvents carry those capabilities
 * whether or not they act that way in the jar. Scoring irritation from them
 * punished essentially every product by the same amount — a constant offset,
 * not a signal. Irritation risk therefore stays entirely with the named rules
 * above, which are precise, plus the regulatory `safety` flag.
 *
 * Weights sit well below Layer 1's 4-14: a functional class is weaker
 * evidence than a named ingredient and must never outvote one.
 */
export type FunctionSignal = {
  category: RuleCategory;
  weight: number;
  helps: RuleTarget;
};

const FUNCTION_SIGNALS: Record<string, FunctionSignal> = {
  humectant: { category: "hydration", weight: 3, helps: { concerns: ["dehydrated"], skinTypes: ["dry"] } },
  moisturising: { category: "hydration", weight: 3, helps: { concerns: ["dehydrated"], skinTypes: ["dry"] } },
  emollient: { category: "barrier", weight: 2.5, helps: { skinTypes: ["dry"] } },
  "skin-protecting": { category: "barrier", weight: 2.5, helps: { skinTypes: ["dry"], concerns: ["atopic"] } },
  refatting: { category: "barrier", weight: 3, helps: { skinTypes: ["dry"], concerns: ["atopic"] } },
  "film-forming": { category: "barrier", weight: 1.5, helps: { concerns: ["dehydrated"] } },
  // No `antioxidant` and no `uv-absorber` (#175). Both are CosIng functions
  // about the *product*, not the skin: the EU inventory defines an
  // antioxidant as something that "inhibits reactions promoted by oxygen,
  // thus avoiding oxidation and rancidity", and a UV absorber as something
  // that protects the cosmetic product from UV light — as opposed to
  // `uv-filter`, which protects the skin. Crediting them as fine-lines,
  // dullness and dark-spot evidence put BHT and sodium metabisulfite beside
  // vitamin C, and made fine-lines evidence appear in 73% of the catalogue.
  // The antioxidants with real skin evidence (tocopherol, vitamin C and its
  // derivatives, ferulic acid, green tea, CoQ10, resveratrol) each have a
  // named rule above, which always wins over a declared function.
  soothing: { category: "soothing", weight: 4, helps: { concerns: ["redness", "atopic"], sensitive: true } },
  "uv-filter": { category: "actives", weight: 4, helps: { concerns: ["hyperpigmentation", "fine-lines"] } },
  smoothing: { category: "actives", weight: 2, helps: { concerns: ["fine-lines", "dullness"] } },
  absorbent: { category: "actives", weight: 2.5, helps: { skinTypes: ["oily"], concerns: ["large-pores"] } },
  tonic: { category: "soothing", weight: 1.5, helps: { concerns: ["redness"] } },
};

/**
 * CosIng writes the same role two ways ("skin-conditioning" and "skin
 * conditioning"), so every lookup normalises first. Mirrors
 * `scripts/lib/normalise-function.mjs` exactly, `en:` strip included: the
 * OBF taxonomy prefixes its raw tags that way, and this read-side copy has
 * to resolve whatever's actually sitting in `ingredients.functions`, not
 * just what the current importer chooses to write.
 */
export function normaliseFunction(name: string): string {
  return name.trim().replace(/^en:/i, "").toLowerCase().replace(/[\s_]+/g, "-");
}

/** The signal for a declared function, if we score on that role at all. */
export function functionSignal(name: string): FunctionSignal | undefined {
  return FUNCTION_SIGNALS[normaliseFunction(name)];
}

/**
 * How strongly product use changes positive evidence and potential harm.
 *
 * A cleanser is on the skin briefly and is then rinsed off, while a serum can
 * remain all night. Position already proxies concentration; these values proxy
 * contact and exposure. They are broad scoring bands, not SCCS retention
 * values. In particular, `benefit` is an evidence-policy weight rather than a
 * measured fraction of efficacy: there is no universal efficacy-retention
 * factor across ingredients, concentrations and formulations.
 *
 * Known rinse-off and leave-on products use the same number in both
 * directions. Ambiguous or unknown use fails safe asymmetrically: potential
 * harm keeps full leave-on weight, while positive evidence receives only
 * conservative credit rather than an assumed leave-on benefit.
 */
export type ContactWeights = Readonly<{
  /** Conservative exposure used by every negative/risk path. */
  harm: number;
  /** Strength of positive evidence, not a literal efficacy percentage. */
  benefit: number;
}>;

const FULL_CONTACT: ContactWeights = { harm: 1, benefit: 1 };
// `unknown` (type-guess failure) is not one of the four named-ambiguous
// types above — it is roughly 28% of the imported catalogue, so this is its
// own deliberate policy decision, not a mechanical extension of that list.
// Harm stays at 1 for the reason `unknown` always has: guessing wrong can
// only make this app over-cautious about a formula, never quietly
// under-count a real irritant. Benefit is discounted harder than the four
// named types (0.25 rather than 0.5) because those four are at least known
// to sit somewhere between rinse-off and leave-on; an `unknown` product
// could be either extreme, or something this app has never classified
// before, so there is even less basis for crediting it at leave-on
// strength. Named explicitly here rather than left implicit, per review on
// PR #127.
const UNKNOWN_CONTACT: ContactWeights = { harm: 1, benefit: 0.25 };

const EXPOSURE_BY_TYPE: Record<ProductType, ContactWeights> = {
  // Rinsed within about a minute.
  cleanser: { harm: 0.25, benefit: 0.25 },
  "body-wash": { harm: 0.25, benefit: 0.25 },
  // Not rinsed — wiped or patted off, so it gets none of `cleanser`'s
  // discount even though the classifier used to fold it into that type.
  // Split out as its own type (step 13, PR #130) rather than moving all of
  // `cleanser` to full weight: the vast majority of what `cleanser` names
  // genuinely is rinsed within a minute, and discounting that majority to
  // fix this one minority case would trade one wrong answer for a bigger
  // one.
  "micellar-water": FULL_CONTACT,
  // Sits for minutes, then rinsed. A body scrub is the one type where that is
  // unambiguous: it is scrubbed on and washed straight off.
  "body-scrub": { harm: 0.5, benefit: 0.5 },
  // Left on.
  //
  // The four below look like they belong above and deliberately do not,
  // because each spans both exposures with nothing to separate them:
  //
  //   exfoliator   a physical scrub AND a leave-on acid liquid — OBF tags
  //                both `en:face-scrubs`
  //   conditioner  rinse-out AND leave-in
  //   hair-mask    rinsed after twenty minutes AND left in overnight
  //   shampoo      rinsed out AND dry shampoo, sprayed in and left — the bare
  //                `/shampoo/` match in both classifiers catches both
  //
  // Discounting harm could under-count an irritant that was actually left on,
  // so harm remains 1. Benefit uses the same 0.5 mid-point for all four:
  // each name genuinely spans a short-contact and a long-contact variant
  // with nothing here to tell them apart, so there is no more basis for
  // discounting shampoo's benefit further than the other three than there
  // is for discounting it less. (An earlier draft set shampoo to 0.25,
  // singling it out with no stated reason — caught in review on PR #127.)
  exfoliator: { harm: 1, benefit: 0.5 },
  conditioner: { harm: 1, benefit: 0.5 },
  "hair-mask": { harm: 1, benefit: 0.5 },
  shampoo: { harm: 1, benefit: 0.5 },
  // Same ambiguity as the four above: a clay mask is rinsed after ~15
  // minutes, a cream mask often isn't, and nothing in a name or tag tells
  // them apart (issue #105) — same policy, same reasoning.
  "face-mask": { harm: 1, benefit: 0.5 },
  // Not ambiguous, just not rinsed: a sheet mask's essence is patted in.
  "sheet-mask": FULL_CONTACT,
  // Same as sheet-mask — worn, then peeled off, never rinsed. Scored
  // identically to each other on purpose (issue #105): browsing wants them
  // separate, scoring doesn't.
  "eye-patch": FULL_CONTACT,
  "pimple-patch": FULL_CONTACT,
  toner: FULL_CONTACT,
  essence: FULL_CONTACT,
  serum: FULL_CONTACT,
  ampoule: FULL_CONTACT,
  moisturizer: FULL_CONTACT,
  sunscreen: FULL_CONTACT,
  "body-lotion": FULL_CONTACT,
  "hand-cream": FULL_CONTACT,
  "eye-cream": FULL_CONTACT,
  "facial-oil": FULL_CONTACT,
  "night-mask": FULL_CONTACT,
  "lip-balm": FULL_CONTACT,
  perfume: FULL_CONTACT,
  "facial-mist": FULL_CONTACT,
  deodorant: FULL_CONTACT,
  "hair-oil": FULL_CONTACT,
  "body-butter": FULL_CONTACT,
  "foot-cream": FULL_CONTACT,
  // Unknown use gets the same asymmetric fail-safe policy.
  unknown: UNKNOWN_CONTACT,
};

export function contactWeight(type: ProductType): ContactWeights {
  // `products.type` is unconstrained text in the database, and `buildProduct`
  // only asserts it as `ProductType` rather than validating it — so a typo'd
  // or newly-added server-side value can reach here without a matching entry
  // above. `EXPOSURE_BY_TYPE` is a plain object literal, so it inherits
  // `Object.prototype` — a value like "constructor" or "toString" would
  // resolve to that prototype member rather than `undefined`, and `?? 1`
  // never applies to it. The explicit own-property check is what actually
  // catches every unrecognised value, not just the ones that happen to look
  // unrecognised to `??`. Fail into the same asymmetric default `unknown`
  // gets, not into `undefined` or a stray prototype member.
  return Object.prototype.hasOwnProperty.call(EXPOSURE_BY_TYPE, type)
    ? EXPOSURE_BY_TYPE[type]
    : UNKNOWN_CONTACT;
}

/**
 * INCI order is regulated: ingredients appear in descending concentration
 * (above 1%, after which order is free). So the same ingredient means very
 * different things at position 2 and position 30 — a fragrance high in the
 * list is a real exposure, the same word last is a trace.
 *
 * A smooth decay with a FLOOR at 0.3, rather than the banded cliff this used
 * to be. The old shape dropped to 0.1 past position 20, which in a
 * 24-ingredient median formula made most of the list invisible — and Korean
 * formulas routinely put their actives at positions 10-25. The floor exists
 * because INCI order is only regulated above 1%; below that the order is the
 * formulator's choice, so position stops carrying information rather than
 * continuing to decay towards nothing.
 */
export function positionWeight(position: number): number {
  return Math.max(0.3, Math.min(1, 1 / (1 + 0.09 * position)));
}

/**
 * The shortest A-to-Z tail treated as "order carries no information". A
 * random list ends in a sorted run of length r with probability 1/r!, so six
 * is about 1 in 720 — long enough that a real descending-concentration list
 * is very unlikely to trip it.
 */
export const MIN_ALPHABETICAL_RUN = 6;

/**
 * Per-position weights for one ingredient list.
 *
 * `positionWeight` assumes the list runs from most to least. That is true of
 * cosmetic labels (EU 1223/2009 Art. 19(1)(g), 21 CFR 701.3), but an OTC drug
 * that is not also a cosmetic must list its inactive ingredients
 * alphabetically (21 CFR 201.66(c)(8)) — sunscreens and acne treatments filed
 * through DailyMed. Read by position, "ascorbic acid" lands near the front and
 * is charged as a main ingredient purely because of its spelling.
 *
 * Detected from the list itself, not from where it came from: a drug that is
 * also a cosmetic follows the cosmetic rule, so two DailyMed products can
 * differ. The longest A-to-Z run at the END of the list is unordered; the
 * actives are printed first and are left on the normal curve. The run never
 * includes position 0, so a list that is sorted end to end (an active that
 * happens to sort first) still keeps its first entry on the curve.
 *
 * Inside that run every ingredient gets the same weight: the average of
 * `positionWeight` over the positions the run occupies, i.e. the expected
 * weight of an ingredient whose place in that stretch is arbitrary. Derived
 * from the existing curve, not a published figure — nothing published gives a
 * weight for an unordered list.
 */
export function positionWeights(names: readonly string[]): number[] {
  const weights = names.map((_, index) => positionWeight(index));
  const start = alphabeticalTailStart(names);
  if (start === null) return weights;

  let total = 0;
  for (let index = start; index < names.length; index++) total += weights[index];
  const flat = total / (names.length - start);
  for (let index = start; index < names.length; index++) weights[index] = flat;
  return weights;
}

/**
 * Where the unordered A-to-Z tail of a list begins, or null when there is none.
 * Asked directly rather than inferred from `positionWeights`: a tail that starts
 * past the point where the curve has already reached its floor is flattened to
 * the same numbers it had, so the weights alone cannot say it is unordered.
 */
export function alphabeticalTailStart(names: readonly string[]): number | null {
  const key = names.map((name) => name.trim().toLowerCase());
  let start = key.length - 1;
  while (start > 1 && key[start - 1] <= key[start]) start--;
  const runLength = key.length - start;
  return start < 1 || runLength < MIN_ALPHABETICAL_RUN ? null : start;
}

/** Matches an ingredient name against a list of exact names and patterns. */
export function nameMatches(patterns: readonly (string | RegExp)[], inciName: string): boolean {
  const name = inciName.trim().toLowerCase();
  return patterns.some((pattern) => (typeof pattern === "string" ? name === pattern : pattern.test(name)));
}

/** Matches an ingredient name against a rule's name patterns. */
export function ruleMatches(rule: IngredientRule, inciName: string): boolean {
  return nameMatches(rule.names, inciName);
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
