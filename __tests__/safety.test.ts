import { INGREDIENTS } from "@/data/ingredients";
import type { SkinProfile } from "@/data/types";
import type { Ingredient } from "@/data/types";
import { EU_ALLERGEN_COPY, EU_ALLERGEN_SOURCE } from "@/lib/eu-allergens";
import {
  annexIIIEntries,
  contraindications,
  EU_PROHIBITED_SOURCE,
  euAllergenFor,
  groupByRisk,
  historyWarningCount,
  irritationWarnings,
  isVerified,
  regulatoryCondition,
  regulatoryStatus,
} from "@/lib/safety";
import { EMPTY_PROFILE } from "@/store/useAppStore";

const safe = INGREDIENTS["glycerin"]; // comedogenic 0, safe
const cautionIrritant = INGREDIENTS["fragrance"]; // comedogenic 0, caution — "Fragrance (Parfum)", not an Annex III allergen entry
const severeComedogenic = INGREDIENTS["isopropyl-myristate"]; // 5, avoid
const mildlyComedogenic = INGREDIENTS["cetearyl-alcohol"]; // 2, safe
const moderate = INGREDIENTS["coconut-oil"]; // 4, caution

/** An Annex III fragrance allergen (entry 88) as the dictionary carries it. */
const limonene: Ingredient = { id: "limonene", name: "limonene", comedogenic: 0, safety: "caution", verified: true };
/** Entry 87 (hexyl cinnamal): the dictionary has no Annex III note for it, so `safe`. */
const hexylCinnamal: Ingredient = { id: "hexyl cinnamal", name: "hexyl cinnamal", comedogenic: 0, safety: "safe", verified: true };
/** Annex III for another reason (a pH adjuster's maximum): allowed with limits, nothing to do with skin. */
const sodiumHydroxide: Ingredient = { id: "sodium hydroxide", name: "sodium hydroxide", comedogenic: 0, safety: "caution", verified: true, note: "Restricted use (EU Annex III/15a)" };
/** Entry 45, exempt: nearly always a preservative, which a label cannot tell. */
const benzylAlcohol: Ingredient = { id: "benzyl alcohol", name: "benzyl alcohol", comedogenic: 0, safety: "caution", verified: true };
/** A hair-dye entry whose required warning mentions an allergic reaction. */
const resorcinol: Ingredient = { id: "resorcinol", name: "resorcinol", comedogenic: 0, safety: "caution", verified: true };

function profile(overrides: Partial<SkinProfile> = {}): SkinProfile {
  return { ...EMPTY_PROFILE, ...overrides };
}

describe("contraindications", () => {
  it("returns nothing for a clean formula", () => {
    const p = profile({ baseSkinType: "oily", concerns: ["acne-prone"] });
    expect(contraindications([safe, mildlyComedogenic], p)).toEqual([]);
  });

  it("flags 'avoid' ingredients for every profile, regardless of concerns", () => {
    const result = contraindications([severeComedogenic], EMPTY_PROFILE);
    expect(result).toHaveLength(1);
    expect(result[0].ingredient.id).toBe("isopropyl-myristate");
  });

  // #347: the EU Annex II prohibition is the source of "best avoided"; an
  // allergen warning cites the Annex III entry that requires it on labels (#407).
  it("sources an 'avoid' warning to the EU prohibition, and an allergen one to Annex III", () => {
    const [avoid] = contraindications([severeComedogenic], EMPTY_PROFILE);
    expect(avoid.source).toBe(EU_PROHIBITED_SOURCE);
    const [allergen] = contraindications([limonene], profile({ sensitivity: "high" }));
    expect(allergen.origin).toBe("eu-allergen");
    expect(allergen.source).toBe(EU_ALLERGEN_SOURCE);
  });

  // The 0-5 comedogenic column is empty for catalogue rows, so a hazard read
  // from it could never fire (#406); pore-clogging is scored and explained from
  // lib/pore-clogging.ts instead.
  it("does not flag a comedogenic rating, for acne-prone skin or any other", () => {
    // `sensitivity: "none"`, not unset: an unset sensitivity lists coconut
    // oil's `caution` as an irritant (#183), which is a different question.
    const acne = profile({ baseSkinType: "oily", concerns: ["acne-prone"], sensitivity: "none" });
    expect(contraindications([moderate], acne)).toEqual([]);
    const dry = profile({ baseSkinType: "dry", concerns: ["dehydrated"], sensitivity: "none" });
    expect(contraindications([moderate], dry)).toEqual([]);
  });

  it("flags EU allergens for sensitive skin, not for skin that said it isn't", () => {
    const sensitive = profile({ sensitivity: "some" });
    const notSensitive = profile({ baseSkinType: "oily", sensitivity: "none" });
    expect(contraindications([limonene], sensitive)).toHaveLength(1);
    expect(contraindications([limonene], notSensitive)).toEqual([]);
  });

  // #407: "restricted" alone is allowed-with-conditions for everyone.
  it("lists no warning for an ingredient that is only restricted, or for exempt benzyl alcohol", () => {
    const sensitive = profile({ sensitivity: "high" });
    expect(contraindications([sodiumHydroxide, benzylAlcohol, cautionIrritant], sensitive)).toEqual([]);
    expect(euAllergenFor(sodiumHydroxide)).toBeNull();
    expect(euAllergenFor(benzylAlcohol)).toBeNull();
  });

  it("flags an allergen the dictionary calls safe, and one whose entry is an allergy warning", () => {
    const sensitive = profile({ sensitivity: "some" });
    expect(contraindications([hexylCinnamal], sensitive).map((w) => w.reason)).toEqual([EU_ALLERGEN_COPY.fragranceReason("Hexyl Cinnamal")]);
    expect(contraindications([resorcinol], sensitive).map((w) => w.reason)).toEqual([EU_ALLERGEN_COPY.warningReason("Resorcinol")]);
  });

  it("leaves a hazard as the hazard alone, and an unrecognised name unflagged", () => {
    const prohibited: Ingredient = { ...limonene, safety: "avoid" };
    expect(contraindications([prohibited], profile({ sensitivity: "high" })).map((w) => w.origin)).toEqual(["avoid"]);
    expect(contraindications([{ ...limonene, verified: false }], profile({ sensitivity: "high" }))).toEqual([]);
  });

  // #183: an unset sensitivity is judged at the middle setting, so the
  // irritant the score charges is also the one listed.
  it("flags EU allergens for a scored profile with sensitivity unset, in words that claim nothing they said", () => {
    const unset = profile({ baseSkinType: "oily", sensitivity: null });
    const [warning] = contraindications([limonene], unset);
    const said = EU_ALLERGEN_COPY.fragranceReason("Limonene");
    expect(warning).toMatchObject({ severity: "irritant", origin: "eu-allergen", reason: `${said}${EU_ALLERGEN_COPY.unsetNote}` });
    expect(warning.reason).not.toMatch(/you (told|said)|not sure/i);
    // Someone who did say they're sensitive gets the sentence alone.
    expect(contraindications([limonene], profile({ sensitivity: "some" }))[0].reason).toBe(said);
  });

  // The regression the naive "null means sensitive" version would cause: a
  // visitor with no profile at all seeing "N flagged for your skin".
  it("shows a visitor with no profile nothing but profile-independent hazards", () => {
    expect(contraindications([limonene, moderate, safe], EMPTY_PROFILE)).toEqual([]);
    expect(contraindications([limonene, severeComedogenic], EMPTY_PROFILE).map((w) => w.origin)).toEqual([
      "avoid",
    ]);
  });

  it("reports each problem ingredient once", () => {
    // limonene is an EU allergen: a sensitive acne-prone user sees it once.
    const p = profile({ sensitivity: "some", concerns: ["acne-prone"] });
    expect(contraindications([limonene], p)).toHaveLength(1);
    // coconut-oil is caution and rated comedogenic 4, but only restricted: no warning.
    expect(contraindications([moderate], p)).toHaveLength(0);
  });

  // Pregnancy caution is a name-pattern match (lib/pregnancy-caution.ts), not
  // a dictionary field — verified: true here specifically to prove it isn't
  // riding on the "unverified is unassessed" skip the loop above applies to
  // ingredient.safety/comedogenic checks.
  const retinol: Ingredient = {
    id: "retinol",
    name: "Retinol",
    comedogenic: 0,
    safety: "safe",
    verified: true,
  };

  it("flags a pregnancy-caution ingredient only when pregnant or breastfeeding", () => {
    expect(contraindications([retinol], profile({ pregnancyStatus: "pregnant" }))).toHaveLength(1);
    expect(
      contraindications([retinol], profile({ pregnancyStatus: "breastfeeding" }))
    ).toHaveLength(1);
    expect(contraindications([retinol], profile({ pregnancyStatus: "neither" }))).toEqual([]);
    expect(contraindications([retinol], profile({ pregnancyStatus: null }))).toEqual([]);
  });

  it("flags a pregnancy-caution ingredient even when unrecognised", () => {
    // Unlike the safety/comedogenic checks above, this is a name-pattern
    // match — a false negative here (missing "retinol" because the row
    // never matched our dictionary) is worse than a redundant warning.
    const unverifiedRetinol: Ingredient = { ...retinol, verified: false };
    const result = contraindications(
      [unverifiedRetinol],
      profile({ pregnancyStatus: "pregnant" })
    );
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("irritant");
  });

  it("reports an ingredient once per origin when both sensitivity and pregnancy flag it", () => {
    // #187: pregnancy now gets its own section on the result screen, so an
    // ingredient that is both a reactive-skin irritant and a pregnancy
    // caution must appear in both sections — once per origin, not deduped
    // into one entry. This intentionally replaces the old "reports an
    // ingredient once" expectation (was toHaveLength(1)): that invariant
    // held only while there was a single combined count, and this ticket's
    // fix is exactly what removes that count.
    // Lavender oil is an EU-labelled allergen (entry 360) and an essential oil
    // advised against in pregnancy.
    const lavenderOil: Ingredient = {
      id: "lavandula angustifolia oil",
      name: "lavandula angustifolia oil",
      comedogenic: 0,
      safety: "safe",
      verified: true,
    };
    const result = contraindications(
      [lavenderOil],
      profile({ sensitivity: "some", pregnancyStatus: "pregnant" })
    );
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.origin).sort()).toEqual(["eu-allergen", "pregnancy"]);
  });

  // #186: names added to close a gap between the scoring rule and the
  // pregnancy-caution list — each must fire the caution on its own.
  function pregnancyCautionIngredient(name: string, overrides: Partial<Ingredient> = {}): Ingredient {
    return { id: name, name, comedogenic: 0, safety: "safe", verified: true, ...overrides };
  }

  it.each([
    "hydroxypinacolone retinoate",
    "retinyl retinoate",
    "betaine salicylate",
    "salix alba bark extract",
  ])('flags "%s" as a pregnancy caution for pregnant and breastfeeding', (name: string) => {
    const ingredient = pregnancyCautionIngredient(name);
    expect(contraindications([ingredient], profile({ pregnancyStatus: "pregnant" }))).toHaveLength(
      1
    );
    expect(
      contraindications([ingredient], profile({ pregnancyStatus: "breastfeeding" }))
    ).toHaveLength(1);
  });

  it("flags salix alba bark extract even when unrecognised", () => {
    const unverified = pregnancyCautionIngredient("salix alba bark extract", { verified: false });
    const result = contraindications([unverified], profile({ pregnancyStatus: "pregnant" }));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("irritant");
  });

  it("does not flag benzyl salicylate as a pregnancy caution", () => {
    const ingredient = pregnancyCautionIngredient("benzyl salicylate");
    expect(contraindications([ingredient], profile({ pregnancyStatus: "pregnant" }))).toEqual([]);
  });

  // Found in review on #257 (Codex): a product whose only contraindication is
  // pregnancy-origin (e.g. tretinoin) recorded warningsAtView: 0 via
  // irritationWarnings, so it vanished from history's "N flagged" badge
  // entirely instead of just moving to its own section on the live screen.
  it("counts a pregnancy-only caution toward history but not toward the irritation card", () => {
    const tretinoin = pregnancyCautionIngredient("tretinoin");
    const warnings = contraindications([tretinoin], profile({ pregnancyStatus: "pregnant" }));
    expect(warnings).toHaveLength(1);
    expect(irritationWarnings(warnings)).toHaveLength(0);
    expect(historyWarningCount(warnings)).toBe(1);
  });
});

/**
 * Open Beauty Facts ingredient text is crowdsourced and often OCR-mangled —
 * the live catalogue contains fused entries like "Ulmus Davidiana Root raria
 * Lobata Root". These pin the rule that an unrecognised name is *unassessed*,
 * never quietly counted as fine.
 */
describe("unverified ingredients", () => {
  const unrecognised: Ingredient = {
    id: "ulmus davidiana root raria lobata root",
    name: "ulmus davidiana root raria lobata root",
    comedogenic: 0,
    safety: "safe",
    verified: false,
  };

  // The hand-written sample catalogue predates the flag and is trusted.
  it("treats a missing flag as verified, so the sample catalogue is unaffected", () => {
    expect(safe.verified).toBeUndefined();
    expect(isVerified(safe)).toBe(true);
  });

  it("treats an explicit false as unverified", () => {
    expect(isVerified(unrecognised)).toBe(false);
  });

  /** The heart of it: never file an unknown under "No concerns". */
  it("buckets an unrecognised name as unknown rather than clean", () => {
    const groups = groupByRisk([unrecognised]);
    expect(groups.unknown).toHaveLength(1);
    expect(groups.clean).toEqual([]);
    expect(groups.caution).toEqual([]);
    expect(groups.avoid).toEqual([]);
  });

  it("keeps verified ingredients in their normal tiers alongside it", () => {
    const groups = groupByRisk([safe, severeComedogenic, unrecognised]);
    expect(groups.clean).toEqual([safe]);
    expect(groups.avoid).toEqual([severeComedogenic]);
    expect(groups.unknown).toEqual([unrecognised]);
  });

  /**
   * A name we cannot identify supports no claim in either direction, so it
   * must not raise a warning any more than it may suppress one.
   */
  it("raises no contraindication from an unrecognised name", () => {
    const dangerousLooking: Ingredient = { ...unrecognised, safety: "avoid", comedogenic: 5 };
    expect(contraindications([dangerousLooking], profile({ concerns: ["acne-prone"] }))).toEqual(
      []
    );
  });

  it("still contraindicates the same ingredient once it is verified", () => {
    const verified: Ingredient = {
      ...unrecognised,
      safety: "avoid",
      comedogenic: 5,
      verified: true,
    };
    expect(contraindications([verified], profile())).toHaveLength(1);
  });
});

describe("allowed with limits (#407)", () => {
  it("files an allergen under caution, and a restricted-only or exempt ingredient under clean", () => {
    const groups = groupByRisk([limonene, hexylCinnamal, sodiumHydroxide, benzylAlcohol]);
    expect(groups.caution).toEqual([limonene, hexylCinnamal]);
    expect(groups.clean).toEqual([sodiumHydroxide, benzylAlcohol]);
  });

  it("says 'Allowed with limits' for Annex III, and 'No EU listing found' for no entry", () => {
    expect(regulatoryStatus(sodiumHydroxide)).toBe("Allowed with limits");
    expect(regulatoryStatus(benzylAlcohol)).toBe("Allowed with limits");
    expect(regulatoryStatus(hexylCinnamal)).toBe("Allowed with limits");
    expect(regulatoryStatus(safe)).toBe("No EU listing found");
  });

  // #469: the dictionary finding no entry is not a finding that a substance is safe.
  it("never says 'safe' in an ingredient's EU status or in the words the status draws on", () => {
    const named = (name: string, overrides: Partial<Ingredient> = {}): Ingredient => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true, functions: [], ...overrides });
    const statuses = [
      regulatoryStatus(safe),
      regulatoryStatus(named("hydroquinone", { safety: "avoid" })),
      regulatoryStatus(named("mystery", { verified: false })),
      regulatoryStatus(named("petrolatum", { note: "Allowed when fully refined. The EU bans it only when its refining history isn't known (EU Annex II/904)" })),
      regulatoryStatus(named("cannabidiol", { note: "EU rules depend on how it's made." })),
      regulatoryStatus(sodiumHydroxide),
      ...Object.values(EU_ALLERGEN_COPY).flatMap((value) => (typeof value === "string" ? [value] : [])),
    ];
    for (const status of statuses) expect(status).not.toMatch(/\bsafe\b/i);
  });

  it("gives the condition we hold: an allergen's label duty, else the cited entry number", () => {
    expect(regulatoryCondition(limonene)).toMatch(/^Annex III, entry 88\. Must be named on the label above 0\.001%/);
    expect(regulatoryCondition(resorcinol)).toMatch(/^Annex III, entry 22\. Needs a warning about allergic reactions/);
    expect(regulatoryCondition(sodiumHydroxide)).toBe("Annex III, entry 15a");
    // Benzyl alcohol is exempt: its label duty depends on why it is there, so it is not stated flat.
    expect(regulatoryCondition(benzylAlcohol)).toBe("Annex III, entry 45. The label duty applies only when it is not there as a preservative.");
    expect(regulatoryCondition(safe)).toBeNull();
    expect(regulatoryCondition({ ...limonene, safety: "avoid" })).toBeNull();
  });

  it("reads the entry numbers a note cites, never an Annex II number or the old Part I numbering", () => {
    expect(annexIIIEntries("Restricted use (EU Annex III/1a III/61)")).toEqual(["1a", "61"]);
    expect(annexIIIEntries("Prohibited in cosmetics (EU Annex II/1339 III/14)")).toEqual(["14"]);
    expect(annexIIIEntries("Restricted use (EU Annex III/I/257)")).toEqual([]);
    expect(annexIIIEntries(undefined)).toEqual([]);
  });
});
