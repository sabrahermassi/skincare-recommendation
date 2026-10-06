import type { Ingredient, SkinProfile } from "@/data/types";
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
 */
export function regulatoryStatus(ingredient: Ingredient): string {
  if (!isVerified(ingredient)) return "Unmatched";
  if (ingredient.safety === "avoid") return "Prohibited";
  if (ingredient.safety === "caution") return "Restricted";
  if (ingredient.note?.startsWith(REFINED_GRADE_NOTE_START)) return "Allowed when refined";
  if (ingredient.note?.startsWith(NATURAL_ESSENCE_NOTE_START)) return "Allowed, with a limit on furocoumarins";
  if (isOriginDependent(ingredient)) return ORIGIN_DEPENDENT_HEADLINE;
  return "No restriction";
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
   * `irritant` — it is restricted or commonly reactive, and the user said
   *   their skin reacts. Worth showing, but graduated rather than absolute.
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
  origin: "avoid" | "restricted" | "pregnancy";
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
 * Annex III ("restricted") has no source here on purpose: the regulation says
 * those ingredients are allowed only within set limits, not that they are
 * common irritants, which is what that warning tells the user.
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
  // Pending: the owner confirms 1339 on the current consolidated EUR-Lex text. Until then it does not fire.
  { entry: 1339, ingredient: "hydroquinone", regulation: null, verified: null, verifiedBy: null },
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
 * verified list with a date.
 */
export function safetyNoticeFor(ingredient: Ingredient, enabled: boolean): SafetyNoticeEntry | null {
  if (!enabled || !isVerified(ingredient) || ingredient.safety !== "avoid") return null;
  const cited = annexIIEntries(ingredient.note);
  return SAFETY_NOTICE_ENTRIES.find((entry) => entry.verified !== null && cited.includes(entry.entry)) ?? null;
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
 * A restricted ingredient's warning when sensitivity isn't set (#183). Says
 * what the app did, never what the person said — most unset profiles simply
 * stopped the quiz before that question.
 */
export const UNSET_SENSITIVITY_REASON =
  "May irritate reactive skin — judged at the middle setting because your sensitivity isn't set";

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
  const cautionReason = isSensitive(profile) ? "Common irritant for sensitive skin" : UNSET_SENSITIVITY_REASON;

  for (const ingredient of ingredients) {
    // An unrecognised name supports no claim in either direction. Skipping it
    // means the product is neither warned about nor vouched for on its basis.
    if (!isVerified(ingredient)) continue;

    // "avoid" applies to everyone — it is not profile-dependent.
    if (ingredient.safety === "avoid") {
      found.push({ ingredient, reason: "Flagged as best avoided", severity: "hazard", origin: "avoid", source: EU_PROHIBITED_SOURCE });
      continue;
    }

    if (reactive && ingredient.safety === "caution") {
      found.push({
        ingredient,
        reason: cautionReason,
        severity: "irritant",
        origin: "restricted",
      });
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
 * list, from the regulatory `safety` field and the comedogenic threshold.
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
    } else if (
      ingredient.safety === "caution" ||
      ingredient.comedogenic >= COMEDOGENIC_FLAG_THRESHOLD
    ) {
      groups.caution.push(ingredient);
    } else {
      groups.clean.push(ingredient);
    }
  }

  return groups;
}
