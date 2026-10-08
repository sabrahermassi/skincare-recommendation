import type { Ingredient, MatchConfidence, SkinProfile } from "@/data/types";
import { EU_ALLERGEN_CONDITION, EU_ALLERGEN_COPY, EU_ALLERGEN_SOURCE, euAllergenEntry, type EuAllergenEntry } from "./eu-allergens";
import { displayIngredientName } from "./ingredient-name";
import { pregnancyCautionHits } from "./pregnancy-caution";
import { isSensitive, treatAsReactive } from "./profile";
import type { RuleSource } from "./rules";

/**
 * Single source of truth for ingredient risk. Previously this predicate was
 * copy-pasted across several screens, which let a "Flagged" count drift out
 * of step with the detail screen's banner.
 */

/** Comedogenic rating at or above which we consider an ingredient pore-clogging. */
export const COMEDOGENIC_FLAG_THRESHOLD = 3;

/**
 * Whether a name was read off the label as the dictionary holds it (#458): printed as the
 * dictionary's own name (`exact`) or as a known synonym of it (`alias`). A name the parser had to
 * correct or rebuild is a guess, and a regulatory claim must not rest on a guess. `null` and
 * `undefined` are "not known", and read as low.
 */
export function isHighConfidenceMatch(match: MatchConfidence | null | undefined): boolean {
  return match === "exact" || match === "alias";
}

/**
 * Whether a name was matched to an authoritative dictionary. `undefined` means
 * the hand-written sample catalogue, which is trusted; only an explicit
 * `false` marks something parsed off a crowdsourced label and unrecognised.
 */
export function isVerified(ingredient: Ingredient): boolean {
  return ingredient.verified !== false;
}

/**
 * How the note the dictionary import writes on a refined-grade exemption
 * starts (`REFINED_GRADE_NOTE` in scripts/import-inci-dictionary.mjs):
 * petrolatum, whose EU Annex II entry bans only petrolatum of unknown
 * refining history (#361). `__tests__/petrolatum.test.ts` keeps the two in step.
 */
export const REFINED_GRADE_NOTE_START = "Allowed when fully refined.";

/**
 * The other two notes the import writes on a corrected Annex II citation, both
 * `safe` so nothing is charged (`NATURAL_ESSENCE_NOTE` and `ORIGIN_DEPENDENT_NOTE` in
 * scripts/import-inci-dictionary.mjs, mirrored by migration 0030):
 * a natural essence cited under Annex II/358, which limits the furocoumarins in a
 * product and not the essence; and cannabidiol, whose EU status depends on how it
 * is made. `__tests__/annex-ii-corrections.test.ts` keeps the wording in step.
 */
export const NATURAL_ESSENCE_NOTE_START = "Natural essence.";
export const ORIGIN_DEPENDENT_NOTE_START = "EU rules depend on how it's made.";

/** What an origin-dependent ingredient is called wherever another ingredient would read "No known concerns". */
export const ORIGIN_DEPENDENT_HEADLINE = "Depends on how it's made";

/**
 * An ingredient whose EU status depends on how it is made (cannabidiol). Stored `safe` so
 * nothing is charged, but never to be shown as cleared: no "No known concerns", "Nothing
 * against it" or "no concerns" for it, only that the rules depend on how it is made.
 */
export function isOriginDependent(ingredient: Ingredient): boolean {
  return isVerified(ingredient) && ingredient.note?.startsWith(ORIGIN_DEPENDENT_NOTE_START) === true;
}

/**
 * The ingredient page's "EU regulatory status", the honest replacement for the
 * design's EWG hazard score. It comes from the EU Annex lists via CosIng, a
 * regulator rather than an advocacy group's rating, and is one of the few
 * genuinely authoritative facts we hold. A refined-grade exemption says so,
 * rather than "No restriction" under a note about an EU ban (#362).
 *
 * Annex III is "allowed with limits", not "restricted" (#407): the limits are
 * a maximum amount, a product type or a label duty, and none of them is a
 * verdict on anyone's skin. An allergen the dictionary does not carry as
 * Annex III (hexyl cinnamal, menthol) reads the same way, since the label duty
 * is what puts it there.
 */
export function regulatoryStatus(ingredient: Ingredient): string {
  if (!isVerified(ingredient)) return "Unmatched";
  if (ingredient.safety === "avoid") return "Prohibited";
  if (ingredient.safety === "caution" || euAllergenEntry(ingredient.name)) return EU_ALLERGEN_COPY.limits;
  if (ingredient.note?.startsWith(REFINED_GRADE_NOTE_START)) return "Allowed when refined";
  // Two entries are written this way: 358 limits furocoumarins, 360 limits safrole (#468).
  if (ingredient.note?.startsWith(NATURAL_ESSENCE_NOTE_START)) return ingredient.note.includes("safrole") ? "Allowed, with a limit on safrole" : "Allowed, with a limit on furocoumarins";
  if (isOriginDependent(ingredient)) return ORIGIN_DEPENDENT_HEADLINE;
  // Annex IV (colourants), V (preservatives) and VI (UV filters) are positive lists: an ingredient the
  // dictionary cites there is listed, with limits, even though its rating is `safe` (phenyl mercuric borate, #419).
  const positiveList = /\bEU Annex (IV|V|VI)\b/.exec(ingredient.note ?? "")?.[1];
  if (positiveList) return `Listed in EU Annex ${positiveList}`;
  return EU_ALLERGEN_COPY.noneListed;
}

/** The Annex III entry numbers a dictionary note cites: "Restricted use (EU Annex III/1a III/61)" gives ["1a", "61"], never an Annex II number. */
export function annexIIIEntries(note: string | undefined): string[] {
  return [...(note ?? "").matchAll(/III\/(\d+[a-z]?)(?![\w/])/g)].map((match) => match[1]);
}

/**
 * The condition behind "Allowed with limits", where we hold one: the label
 * duty of an allergen entry (read off the regulation, `lib/eu-allergens.ts`),
 * else only which Annex III entry the dictionary cites. The regulation's other
 * limits (a maximum amount, a product type) are not stored, and a number is
 * all that can be said without guessing them.
 */
export function regulatoryCondition(ingredient: Ingredient): string | null {
  if (!isVerified(ingredient) || ingredient.safety === "avoid") return null;
  const allergen = euAllergenEntry(ingredient.name);
  // Benzyl alcohol's entry applies only when it is not a preservative, so the label duty is not stated flat.
  if (allergen?.exempt) return `Annex III, entry ${allergen.entry}. ${EU_ALLERGEN_COPY.exemptCondition}`;
  if (allergen) return `Annex III, entry ${allergen.entry}. ${EU_ALLERGEN_CONDITION[allergen.kind]}`;
  if (ingredient.safety !== "caution") return null;
  const cited = annexIIIEntries(ingredient.note);
  return cited.length > 0 ? `Annex III, ${cited.length === 1 ? "entry" : "entries"} ${cited.join(", ")}` : null;
}

/**
 * The Annex III entry that makes this ingredient matter to sensitive skin, or
 * null (#407). One answer for the score's charge, the warning, the list label
 * and the risk count, so the number on screen and the penalty cannot drift.
 * Needs a recognised name; a name the dictionary marks `avoid` is a hazard and
 * only that; an exempt entry (benzyl alcohol) is on the list but never charged.
 */
export function euAllergenFor(ingredient: Ingredient): EuAllergenEntry | null {
  if (!isVerified(ingredient) || ingredient.safety === "avoid") return null;
  const entry = euAllergenEntry(ingredient.name);
  return entry && !entry.exempt ? entry : null;
}

/**
 * Share of the ingredient list we could identify.
 *
 * Lives here rather than in `lib/matching.ts`, which is where it used to be:
 * `matching.ts` calls into `lib/pore-clogging.ts` (for `poreCloggingHits`),
 * and `pore-clogging.ts` needed this back — a require cycle that "Require
 * cycles are allowed, but can result in uninitialized values" was warning
 * about on every cold start. It never actually broke anything (both call
 * sites read it well after module load, inside a function body, not at
 * module-evaluation time), but a warning that says a class of bug is possible
 * shouldn't be left standing when the fix is moving four lines to the module
 * both callers already depend on regardless.
 */
export function formulaCoverage(ingredients: Ingredient[]): number {
  if (ingredients.length === 0) return 0;
  return ingredients.filter(isVerified).length / ingredients.length;
}

export type Contraindication = {
  ingredient: Ingredient;
  /** Short, user-facing reason this specific profile should be careful. */
  reason: string;
  /**
   * How hard this lands on the score.
   *
   * `hazard`  — the ingredient is a problem in its own right. Caps the score.
   * `irritant` — it is an EU-labelled allergen, and the user said their skin
   *   reacts. Worth showing, but graduated rather than absolute.
   *
   * The distinction exists because collapsing the two capped 40% of the
   * catalogue at "Poor" for anyone who ticked "somewhat sensitive" — 97 of
   * 100 warnings were the `caution` kind — so a sensitive user could never
   * receive good news however gentle a formula was. Sensitivity has three
   * levels now, and the irritation penalty in `lib/matching.ts` is where
   * that nuance belongs; a hard cap has none.
   */
  severity: "hazard" | "irritant";
  /**
   * Where this hit came from, so a consumer can group or filter without
   * string-matching `reason` (#187). `pregnancy` hits are not a general
   * irritation risk — they need their own section on the result screen,
   * separate from the sensitivity count.
   */
  origin: "avoid" | "eu-allergen" | "pregnancy";
  /** Where the caution comes from, when we hold a checked source (#326). */
  source?: RuleSource;
};

/**
 * Where an "avoid" warning comes from (#347): the importers mark an ingredient
 * `avoid` only when the EU lists it in Annex II of the Cosmetics Regulation,
 * and Article 14 says a cosmetic product must not contain one. Read through
 * the EU Publications Office's copy of the same text (CELEX 32009R1223), since
 * EUR-Lex shows automated fetches a bot check.
 *
 * Annex III ("allowed with limits") has no source here on purpose, except for
 * the allergen entries, whose own warning cites `EU_ALLERGEN_SOURCE`: the
 * regulation says the other ingredients are allowed only within set limits,
 * not that they are irritants.
 */
export const EU_PROHIBITED_SOURCE: RuleSource = {
  label: "EU Cosmetics Regulation, Annex II",
  url: "https://eur-lex.europa.eu/eli/reg/2009/1223/oj",
};

/**
 * What the safety notice may say "not permitted in EU cosmetics" about (#404):
 * one Annex II entry each, checked by the owner against the current
 * consolidated EUR-Lex text. **Only an entry with a `verified` date fires**
 * (and only with the feature flag on, `lib/features.ts`); one without sits here
 * unused until its date is filled in. Never add an entry from memory.
 *
 * 358, 764 and 875 are not here on purpose: 358 and 764 are exemptions (#401)
 * and 875 is unexplained, so none of them is a prohibition to tell anyone about.
 * Acrylamide (681) and acrylonitrile (682) join only after the owner verifies them.
 */
export type SafetyNoticeEntry = {
  /** The Annex II entry number the dictionary row cites (`II/1380`). */
  entry: number;
  /** For the owner's audit; the screens name the ingredient as it is on the label. */
  ingredient: string;
  regulation: string | null;
  /** ISO date the owner verified it, or null while it is pending. */
  verified: string | null;
  verifiedBy: "owner" | null;
  /** In words, for the ingredient sheet, when the regulation gives dates. */
  dates?: string;
  /**
   * The dictionary names the entry speaks for, when it is one substance and
   * says something only true of that substance. Without it the notice goes by
   * the cited entry number alone, so a row a source cited under 1339 by
   * mistake would be told it is hydroquinone.
   */
  names?: readonly string[];
};

export const SAFETY_NOTICE_ENTRIES: readonly SafetyNoticeEntry[] = [
  {
    entry: 1380,
    ingredient: "hydroxyisohexyl 3-cyclohexene carboxaldehyde (HICC)",
    regulation: "Regulation (EU) 2017/1410",
    verified: "2026-10-05",
    verifiedBy: "owner",
    dates: "It has not been allowed on the EU market since 23 August 2019 and not to be sold there since 23 August 2021.",
  },
  { entry: 1375, ingredient: "isobutylparaben", regulation: "Regulation (EU) No 358/2014", verified: "2026-10-05", verifiedBy: "owner" },
  // Checked by the owner on the consolidated text (version 18.05.2026) and CosIng, 7 October 2026 (#419).
  {
    entry: 1666,
    ingredient: "butylphenyl methylpropional (Lilial)",
    regulation: "Regulation (EU) 2021/1902",
    verified: "2026-10-07",
    verifiedBy: "owner",
    dates: "It has been prohibited in EU cosmetics since 1 March 2022.",
  },
  { entry: 1395, ingredient: "boric acid", regulation: "Regulation (EU) 2019/831", verified: "2026-10-07", verifiedBy: "owner" },
  { entry: 1394, ingredient: "diboron trioxide", regulation: "Regulation (EU) 2019/831", verified: "2026-10-07", verifiedBy: "owner" },
  {
    entry: 1396,
    ingredient: "borates, tetraborates, octaborates and boric acid salts and esters (sodium borate, potassium borate, borax)",
    regulation: "Regulation (EU) 2019/831, replaced by Regulation (EU) 2019/1966",
    verified: "2026-10-07",
    verifiedBy: "owner",
  },
  // Checked on the consolidated text, the amending regulations and CosIng, approved by the owner on #434, 7 October 2026.
  { entry: 1389, ingredient: "dichloromethane (methylene chloride)", regulation: "Regulation (EU) 2019/831", verified: "2026-10-07", verifiedBy: "owner" },
  {
    entry: 1397,
    ingredient: "perborates and peroxoborates (sodium perborate)",
    regulation: "Regulation (EU) 2019/831, replaced by Regulation (EU) 2026/78",
    verified: "2026-10-07",
    verifiedBy: "owner",
  },
  // Checked by the owner on the consolidated text (CELEX 02009R1223-20260518), Annex II entry 1339 and
  // Annex III entry 14, 7 October 2026.
  {
    entry: 1339,
    ingredient: "hydroquinone",
    regulation: "Regulation (EU) No 344/2013",
    verified: "2026-10-07",
    verifiedBy: "owner",
    // The entry is one substance (CAS 123-31-9), under its one INCI name.
    names: ["hydroquinone"],
  },
  // Pending (#468, the audit of 7 October 2026): the owner confirms each on the current consolidated
  // EUR-Lex text. Until then none fires. The dictionary marks the first two as prohibited today; the
  // other three are not changed there yet (dates and one label still to check).
  { entry: 1730, ingredient: "4-methylbenzylidene camphor", regulation: null, verified: null, verifiedBy: null },
  { entry: 1388, ingredient: "cyclotetrasiloxane (octamethylcyclotetrasiloxane, D4)", regulation: null, verified: null, verifiedBy: null },
  { entry: 1703, ingredient: "benzophenone", regulation: null, verified: null, verifiedBy: null },
  { entry: 1721, ingredient: "pentasodium pentetate", regulation: null, verified: null, verifiedBy: null },
  { entry: 1575, ingredient: "styrene", regulation: null, verified: null, verifiedBy: null },
];

/** The words of the notice, every one audited by `__tests__/claims-policy.test.ts`. */
export const SAFETY_NOTICE_COPY = {
  /** Skin match, the line under the title. */
  matchLine: "This may contain an ingredient not permitted in EU cosmetics. Please check the label.",
  /** Skin match, the red row: the bold name, then this. */
  rowText: " is listed as not permitted in EU cosmetics.",
  rowCaveat: "Formulas vary by country and scans can contain errors.",
  /** With no profile or too little read: a card, then the name and this. */
  cardTitle: "Please check the label",
  cardText: " is listed as not permitted in EU cosmetics. Formulas vary by country, and scans can contain errors.",
  /** Ingredients tab: the word in place of "Avoid", and the line under it. */
  listWord: "Check label",
  listLine: "Not permitted in EU cosmetics",
  /** The same tab's other two words, for the two reasons "Avoid" used to cover. */
  clogWord: "May clog pores",
  pregnancyWord: "Best avoided while pregnant",
  /** For an ingredient the sources say to limit, not avoid (essential oils, salicylic acid; #475). */
  pregnancyLimitWord: "Best limited while pregnant",
  /** The small shield beside a verdict in lists, and what a screen reader says for it (#405). */
  shieldLabel: "Contains an ingredient not permitted in EU cosmetics. Check the label.",
  /** What sharing a product says when the notice applies: no score, no safety claim (#405). */
  shareLine: (brand: string, name: string) => `${brand} ${name}, checked on for.me`,
  /** The ingredient sheet. */
  sheetHeadline: "Not permitted in EU cosmetics",
  sheetBody: (entry: number) =>
    `The EU Cosmetics Regulation lists this ingredient as prohibited (Annex II, entry ${entry}). If it is on a label you scanned, check the label.`,
} as const;

export type SafetyNoticeHit = { ingredient: Ingredient; entry: SafetyNoticeEntry };

/** The Annex II entry numbers a dictionary note cites: "…(EU Annex II/1339 III/14)" gives [1339], never Annex III's 14. */
export function annexIIEntries(note: string | undefined): number[] {
  return [...(note ?? "").matchAll(/(?:^|[^I])II\/(\d+)/g)].map((match) => Number(match[1]));
}

/**
 * The notice for one ingredient, or null. Needs the flag on, a recognised
 * name the dictionary marks `avoid`, and a cited Annex II entry that is on the
 * verified list with a date. An entry that lists its `names` speaks only for
 * those: any other row citing it gets no notice from it.
 */
export function safetyNoticeFor(ingredient: Ingredient, enabled: boolean): SafetyNoticeEntry | null {
  if (!enabled || !isVerified(ingredient) || ingredient.safety !== "avoid") return null;
  const cited = annexIIEntries(ingredient.note);
  const name = ingredient.name.trim().toLowerCase();
  return (
    SAFETY_NOTICE_ENTRIES.find(
      (entry) => entry.verified !== null && cited.includes(entry.entry) && (!entry.names || entry.names.includes(name))
    ) ?? null
  );
}

/**
 * Every ingredient of a product the notice applies to, once each. The one
 * place that decides it: the screens (#404) and the shield and share text
 * (#405) all ask this, with `enabled` from `lib/features.ts`.
 */
export function safetyNoticeHits(ingredients: readonly Ingredient[], enabled: boolean): SafetyNoticeHit[] {
  const hits: SafetyNoticeHit[] = [];
  for (const ingredient of ingredients) {
    const entry = safetyNoticeFor(ingredient, enabled);
    if (entry && !hits.some((hit) => hit.ingredient.name === ingredient.name)) hits.push({ ingredient, entry });
  }
  return hits;
}

/**
 * Ingredients that are a problem *for this particular user*, as opposed to
 * generally flagged.
 *
 * This exists because product-level `targets` tags are author-supplied and can
 * contradict the formula; the warnings are read from the ingredients
 * themselves. Pore-clogging is not one of them: it has no hazard here, and is
 * scored from `lib/pore-clogging.ts` instead (the 0-5 comedogenic column is
 * deliberately empty for catalogue rows, see `ComedogenicRating`).
 *
 * The "avoid" check applies to every visitor, personalised or not, because
 * it isn't profile-dependent — pass `EMPTY_PROFILE` for an unanswered quiz.
 */
export function contraindications(
  ingredients: Ingredient[],
  profile: SkinProfile
): Contraindication[] {
  const found: Contraindication[] = [];
  // Listed on the same condition the irritation penalty charges them (#183),
  // so a score docked for an irritant always shows which one. `treatAsReactive`
  // is false for a visitor with no profile, who keeps seeing hazards only.
  const reactive = treatAsReactive(profile);
  // When sensitivity isn't set (#183) the warning says what the app did, never
  // what the person said — most unset profiles simply stopped the quiz before
  // that question.
  const unsetNote = isSensitive(profile) ? "" : EU_ALLERGEN_COPY.unsetNote;

  for (const ingredient of ingredients) {
    // An unrecognised name supports no claim in either direction. Skipping it
    // means the product is neither warned about nor vouched for on its basis.
    if (!isVerified(ingredient)) continue;

    // "avoid" applies to everyone — it is not profile-dependent.
    if (ingredient.safety === "avoid") {
      found.push({ ingredient, reason: "Flagged as best avoided", severity: "hazard", origin: "avoid", source: EU_PROHIBITED_SOURCE });
      continue;
    }

    // Only the allergen entries of Annex III (#407): "allowed with limits"
    // alone says nothing about a person's skin, so it is never listed here.
    const allergen = reactive ? euAllergenFor(ingredient) : null;
    if (allergen) {
      const name = displayIngredientName(ingredient.name);
      const reason = allergen.kind === "fragrance" ? EU_ALLERGEN_COPY.fragranceReason(name) : EU_ALLERGEN_COPY.warningReason(name);
      found.push({ ingredient, reason: `${reason}${unsetNote}`, severity: "irritant", origin: "eu-allergen", source: EU_ALLERGEN_SOURCE });
    }
  }

  // Checked as its own pass, not folded into the loop above: pregnancy
  // caution is a name-pattern match (see lib/pregnancy-caution.ts), not a
  // dictionary field, so — like pore-clogging — it still fires on an
  // unrecognised name. A false negative here (missing "retinol" because the
  // row never matched our dictionary) is worse than a redundant warning.
  //
  // Pushed even for an ingredient already flagged above (#187): pregnancy
  // gets its own section on the result screen now, so a retinol that is both
  // a reactive-skin irritant and a pregnancy caution must appear in both —
  // once per origin, not deduped into one. `__tests__/safety.test.ts` pins
  // this as "reports an ingredient once per origin".
  if (profile.pregnancyStatus === "pregnant" || profile.pregnancyStatus === "breastfeeding") {
    for (const hit of pregnancyCautionHits(ingredients)) {
      found.push({ ingredient: hit.ingredient, reason: hit.reason, severity: "irritant", origin: "pregnancy", source: hit.source });
    }
  }

  return found;
}

/**
 * Warnings that count as a general irritation risk — everything except a
 * pregnancy hit, which gets its own section rather than inflating a count
 * that reads as "flagged for your skin" (#187). Used by the Irritation card
 * alone: the History log's "N flagged" badge deliberately does NOT use this
 * — see `historyWarningCount` below.
 */
export function irritationWarnings(warnings: Contraindication[]): Contraindication[] {
  return warnings.filter((w) => w.origin !== "pregnancy");
}

/**
 * Every contraindication, including pregnancy-origin ones — the count a
 * history entry's "N flagged" badge (`warningsAtView`) is recorded with.
 * Unlike `irritationWarnings` above, this must NOT exclude pregnancy hits:
 * a pregnancy-only caution (e.g. tretinoin) has to still show as flagged in
 * history, or it silently vanishes there instead of just moving to its own
 * section on the live result screen. Found in review on #257 (Codex).
 */
export function historyWarningCount(warnings: Contraindication[]): number {
  return warnings.length;
}

export type RiskGroup = "avoid" | "caution" | "clean" | "unknown";

/**
 * Buckets ingredients into three risk tiers for the detail screen's grouped
 * list, from the regulatory `safety` field, the EU allergen entries and the
 * comedogenic threshold. An Annex III ingredient that is not an allergen entry
 * is "allowed with limits", which is not a caution (#407).
 */
export function groupByRisk(ingredients: Ingredient[]): Record<RiskGroup, Ingredient[]> {
  const groups: Record<RiskGroup, Ingredient[]> = {
    avoid: [],
    caution: [],
    clean: [],
    unknown: [],
  };

  for (const ingredient of ingredients) {
    // Its own tier, because the alternative is filing an unrecognised name
    // under "No concerns" — presenting a gap in our data as a clean result.
    if (!isVerified(ingredient)) {
      groups.unknown.push(ingredient);
      continue;
    }
    if (ingredient.safety === "avoid") {
      groups.avoid.push(ingredient);
    } else if (euAllergenFor(ingredient) !== null || ingredient.comedogenic >= COMEDOGENIC_FLAG_THRESHOLD) {
      groups.caution.push(ingredient);
    } else {
      groups.clean.push(ingredient);
    }
  }

  return groups;
}
