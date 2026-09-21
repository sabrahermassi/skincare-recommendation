import {
  guessType,
  MIN_KNOWN_INGREDIENT_RATIO,
  parseInci,
  toRow,
} from "../scripts/import-obf.mjs";

/**
 * The gates the Open Beauty Facts import judges a row on.
 *
 * Step 5's done-when is "a deliberately mangled ingredient list is rejected by
 * the dry run". Until this file, the only way to check that was to run the
 * import and read the output — which needs a service-role key, hits a
 * volunteer-run API, and proves nothing about the *next* change. The gates are
 * ordinary functions, so they get an ordinary test.
 *
 * `toRow` returns the row on success and a string naming the reason on
 * rejection, which is what the importer counts and prints.
 */

/**
 * A dictionary stand-in. The real one is ~35,805 verified INCI names read from
 * the `ingredients` table; the gate only ever asks it "do you contain this
 * name", so a Set of the names each case needs is the whole contract.
 */
const KNOWN = new Set([
  "aqua",
  "glycerin",
  "niacinamide",
  "butylene glycol",
  "1,2-hexanediol",
  "panthenol",
  "sodium hyaluronate",
  "cetearyl alcohol",
  "phenoxyethanol",
  "tocopherol",
]);

/** The shape OBF returns, reduced to the fields `toRow` reads. */
function obfProduct(overrides: Record<string, unknown> = {}) {
  return {
    code: "8801234567890",
    product_name: "Test Hydrating Serum",
    brands: "Testbrand",
    quantity: "50ml",
    categories_tags: ["en:face"],
    ingredients_text:
      "Aqua, Glycerin, Niacinamide, Butylene Glycol, 1,2-Hexanediol, Panthenol",
    ...overrides,
  };
}

/**
 * Narrow `toRow`'s result to the success case.
 *
 * It returns the row, or a string naming why the row was rejected — a union
 * `tsc` infers from the script itself, so the test gets real type checking
 * rather than a blanket `@ts-nocheck`. Asserting here also turns "property
 * does not exist" into the rejection reason, which is the useful message.
 */
function expectKept<T>(result: T | string): T {
  if (typeof result === "string") {
    throw new Error(`expected the row to be kept, but it was rejected: ${result}`);
  }
  return result;
}

describe("the import rejects what it cannot believe", () => {
  it("accepts a real formula", () => {
    const row = expectKept(toRow(obfProduct(), KNOWN, []));
    expect(row.product.id).toBe("obf-8801234567890");
    expect(row.ingredients[0].inci_name).toBe("aqua");
  });

  // The done-when for step 5, stated as a test rather than as a paragraph of
  // dry-run output. Every name here is plausible-looking text that is not an
  // ingredient — which is exactly what an OCR smear or a marketing paragraph
  // looks like coming out of the parser.
  it("rejects a deliberately mangled ingredient list", () => {
    const mangled = toRow(
      obfProduct({
        ingredients_text:
          "Ulmus Davidiana Root raria Lobata Root, fll, aux, moins de, " +
          "agents de surface anioniques, se recomandă consult stomatologic",
      }),
      KNOWN,
      []
    );
    expect(mangled).toBe("formula not recognised by the dictionary");
  });

  it("names the reason it rejected, so a run can count them", () => {
    expect(toRow(obfProduct({ product_name: "" }), KNOWN, [])).toBe(
      "no name, formula or barcode"
    );
    expect(toRow(obfProduct({ code: undefined }), KNOWN, [])).toBe(
      "no name, formula or barcode"
    );
    expect(toRow(obfProduct({ ingredients_text: "Aqua" }), KNOWN, [])).toBe(
      "fewer than 2 parsed ingredients"
    );
  });

  // The threshold is a judgement call backed by measurement (see the constant's
  // own comment), so this pins the boundary rather than the number: a formula
  // sitting exactly on it is kept, one below it is not.
  it("keeps a formula on the threshold and drops one below it", () => {
    // 6 of 10 recognised = 0.6 exactly.
    const onTheLine = expectKept(
      toRow(
        obfProduct({
          ingredients_text:
            "Aqua, Glycerin, Niacinamide, Panthenol, Tocopherol, Phenoxyethanol, " +
            "zzz alpha, zzz beta, zzz gamma, zzz delta",
        }),
        KNOWN,
        []
      )
    );
    expect(onTheLine.ingredients).toHaveLength(10);

    // 5 of 10 = 0.5.
    const belowIt = toRow(
      obfProduct({
        ingredients_text:
          "Aqua, Glycerin, Niacinamide, Panthenol, Tocopherol, " +
          "zzz alpha, zzz beta, zzz gamma, zzz delta, zzz epsilon",
      }),
      KNOWN,
      []
    );
    expect(belowIt).toBe("formula not recognised by the dictionary");
    expect(MIN_KNOWN_INGREDIENT_RATIO).toBe(0.6);
  });

  it("collects the first few rejections verbatim, for tuning", () => {
    const samples: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      toRow(obfProduct({ ingredients_text: "zzz one, zzz two, zzz three" }), KNOWN, samples);
    }
    // Capped, so a run that rejects thousands does not print thousands.
    expect(samples).toHaveLength(5);
    expect(samples[0]).toContain("0/3 recognised");
  });
});

describe("the parser matches lib/inci.ts", () => {
  it("drops an Ingredients: heading rather than storing it as an ingredient", () => {
    const parsed = parseInci("Ingredients: Aqua, Glycerin");
    expect(parsed.map((p: { inci_name: string }) => p.inci_name)).toEqual([
      "aqua",
      "glycerin",
    ]);
  });

  it("truncates at label boilerplate", () => {
    const parsed = parseInci("Aqua, Glycerin. Made in Nigeria, customer care 0800");
    expect(parsed.map((p: { inci_name: string }) => p.inci_name)).toEqual([
      "aqua",
      "glycerin",
    ]);
  });

  it("keeps the comma inside 1,2-Hexanediol", () => {
    const parsed = parseInci("Aqua, 1,2-Hexanediol, Glycerin");
    expect(parsed.map((p: { inci_name: string }) => p.inci_name)).toEqual([
      "aqua",
      "1,2-hexanediol",
      "glycerin",
    ]);
  });

  it("deduplicates a repeated name and renumbers positions", () => {
    const parsed = parseInci("Aqua, Glycerin, Aqua, Panthenol");
    expect(parsed).toEqual([
      { inci_name: "aqua", position: 0 },
      { inci_name: "glycerin", position: 1 },
      { inci_name: "panthenol", position: 2 },
    ]);
  });

  it("drops a token carrying no letters", () => {
    const parsed = parseInci("Aqua, 400, Glycerin");
    expect(parsed.map((p: { inci_name: string }) => p.inci_name)).toEqual([
      "aqua",
      "glycerin",
    ]);
  });

  // The label scanner has always read the synonyms table; the importer did not,
  // so a French formula was judged against English names only and rejected by
  // the plausibility gate for reading as unrecognised.
  it("reads another name for an ingredient through the synonyms table", () => {
    const known = new Set(["aqua", "glycerin", "polyvinyl alcohol", "panthenol"]);
    const aliases = new Map([
      ["glycérine", "glycerin"],
      ["alcool polyvinylique", "polyvinyl alcohol"],
    ]);
    const parsed = parseInci("Aqua, Alcool Polyvinylique, Glycérine, Panthenol", known, undefined, aliases);
    expect(parsed.map((p: { inci_name: string }) => p.inci_name)).toEqual([
      "aqua",
      "polyvinyl alcohol",
      "glycerin",
      "panthenol",
    ]);
  });

  it("leaves a name alone when no synonyms are supplied", () => {
    const known = new Set(["aqua", "glycerin"]);
    const parsed = parseInci("Aqua, Glycérine", known);
    expect(parsed.map((p: { inci_name: string }) => p.inci_name)).toContain("glycérine");
  });
});

/**
 * `guessType` is shared by the importer and Edge Function. Specific formats
 * and exclusions still have deliberate precedence, and every case below is a
 * regression a review caught before the classifier was consolidated.
 */
describe("guessType", () => {
  it("classifies an OTC benzoyl-peroxide gel as a full-contact leave-on", () => {
    expect(guessType([], "Acne Treatment Benzoyl Peroxide 10% Gel")).toBe("serum");
  });
  it("reads hyphenated OBF category tags, not just spaced names", () => {
    // `categories_tags` arrive as `en:eye-cream`. Written with a literal
    // space, these patterns missed and the generic `cream` rule claimed them.
    expect(guessType(["en:eye-cream"], "Brand X 30ml")).toBe("eye-cream");
    expect(guessType(["en:sheet-masks"], "Brand X")).toBe("sheet-mask");
    expect(guessType(["en:facial-oils"], "Brand X")).toBe("facial-oil");
    expect(guessType(["en:hair-masks"], "Brand X")).toBe("hair-mask");
    expect(guessType(["en:foot-cream"], "Brand X")).toBe("foot-cream");
  });

  it("keeps a lip product with SPF a lip balm, not a sunscreen", () => {
    expect(guessType([], "Lip Balm SPF 15")).toBe("lip-balm");
  });

  it("keeps a shampoo a shampoo when the name also says cleansing", () => {
    // Tags and name share one haystack, so the broad `cleansing` rule used to
    // claim this even with en:shampoos on the row.
    expect(guessType(["en:shampoos"], "Deep Cleansing Shampoo")).toBe("shampoo");
    expect(guessType([], "Purifying Cleansing Shampoo")).toBe("shampoo");
  });

  it("gives a micellar water its own type instead of folding it into cleanser", () => {
    // It used to be one of the generic cleanser rule's own alternatives, so
    // a name carrying both words (a product genuinely named "cleansing
    // micellar water") has to resolve to the more specific type, checked
    // first — same precedence rule as shampoo/cleansing above.
    expect(guessType([], "Micellar Water")).toBe("micellar-water");
    expect(guessType(["en:cleansers"], "Cleansing Micellar Water")).toBe("micellar-water");
    expect(guessType([], "Micellar Cleansing Water")).toBe("micellar-water");
    // A genuine foaming cleanser is unaffected.
    expect(guessType([], "Gentle Foaming Cleanser")).toBe("cleanser");
    // "Micellar" alone, without "water", is a real rinse-off format too
    // ("Micellar Foaming Cleanser", "Bi-Phase Micellar Wash") — the rule
    // requires both words so these still fall through to the generic
    // cleanser rule rather than getting full leave-on contact weight for a
    // product that's genuinely rinsed off.
    expect(guessType([], "Micellar Foaming Cleanser")).toBe("cleanser");
    expect(guessType([], "Bi-Phase Micellar Foam")).toBe("cleanser");
    // Codex, P1: "water" alongside "micellar" wasn't enough either — both
    // words can appear in a genuinely rinse-off name without being
    // adjacent. An explicit rinse-off format word now excludes the match
    // regardless of where "water" sits in the name.
    expect(guessType([], "Micellar Water Foaming Cleanser")).toBe("cleanser");
    // No other rule in the table matches "gel"/"wash" bare, so this falls
    // through to "unknown" rather than "cleanser" — still the point of the
    // fix (not "micellar-water" at full leave-on weight), and "unknown"'s
    // own conservative-benefit/full-harm policy is the safe place to land.
    expect(guessType([], "Water Boost Micellar Facial Gel Wash")).toBe("unknown");
    // Codex, P1 again: the exclusion above was still position-dependent — an
    // unanchored zero-width lookahead chain can retry at a later starting
    // point in the string, past the excluded word, and match there instead.
    // These put the rinse-off marker *before* "micellar"/"water" rather
    // than after, which is exactly the ordering that defeated it.
    expect(guessType([], "Foaming Micellar Water")).toBe("cleanser");
    expect(guessType([], "Facial Wash Micellar Water")).toBe("unknown");
  });

  it("does not call a skin conditioner a hair conditioner", () => {
    // It was taking the hair-conditioner label and illustration.
    expect(guessType(["en:face"], "Skin Conditioner")).not.toBe("conditioner");
    expect(guessType([], "Skin-Conditioner Essence")).not.toBe("conditioner");
    // A real hair conditioner still resolves.
    expect(guessType(["en:hair-conditioners"], "Repair Conditioner")).toBe("conditioner");
  });

  it("prefers the specific type over a bare serum match", () => {
    expect(guessType([], "Serum Sheet Mask")).toBe("sheet-mask");
    expect(guessType([], "Serum Hair Mask")).toBe("hair-mask");
  });

  it("no longer routes leave-on peel pads into the rinse-off exfoliator type", () => {
    // Kept even though `exfoliator` now carries full weight: a peel pad is a
    // leave-on acid treatment, and "serum" via the ingredient rule describes
    // it better than a type whose name says scrub.
    expect(guessType([], "Glycolic Peeling Pads")).toBe("unknown");
    // Physical scrubs, which really are rinsed off, still land there.
    expect(guessType([], "Apricot Face Scrub")).toBe("exfoliator");
  });

  // Issue #105's own real examples, seen typing as "unknown" before these
  // patterns existed.
  it("types a generic clay/cream mask as face-mask, in any of the languages seen so far", () => {
    expect(guessType([], "Glass Skin Collagen Maske")).toBe("face-mask");
    expect(guessType([], "Maschera Viso Purificante")).toBe("face-mask");
  });

  it("prefers eye-patch over the generic face-mask rule even when the name says mask", () => {
    expect(guessType([], "Eye Pad Mask Paradise Punch")).toBe("eye-patch");
    expect(guessType([], "Dear Klairs Blue Caffeine Full Cover Eye patch")).toBe("eye-patch");
  });

  it("types a plain 'eye mask' as eye-patch, since that's the same real product", () => {
    // In real skincare naming an "eye mask" and an "eye patch" are the same
    // hydrogel under-eye product, not a generic face mask (found on PR #129).
    expect(guessType([], "Hydrogel Eye Mask")).toBe("eye-patch");
  });

  it("types a pimple/hydrocolloid patch as pimple-patch", () => {
    expect(guessType([], "Hydrocolloid Blemish Care Pimple Patches")).toBe("pimple-patch");
    expect(guessType([], "Acne Spot Patch")).toBe("pimple-patch");
  });

  it("does not call a bare hydrocolloid wound dressing a pimple patch without acne context", () => {
    // A bare "hydrocolloid" match (no acne/blemish/pimple/spot word required)
    // used to also claim wound and blister dressings reached via the UPC
    // barcode-database fallback — a real first-aid product, not skincare
    // (found on PR #129).
    expect(guessType([], "Compeed Advanced Blister Cushions Hydrocolloid")).not.toBe(
      "pimple-patch"
    );
  });

  it("does not call a BB cream or a spot-treatment serum a pimple patch just for saying blemish/pimple", () => {
    // A bare `blemish`/`pimple` match (no `patch` qualifier) used to also
    // claim these — "Blemish Balm" is the literal expansion of "BB cream", a
    // real and common Korean-beauty category, not a patch at all.
    expect(guessType([], "Blemish Balm Cream")).toBe("moisturizer");
    expect(guessType([], "Anti-Blemish Gel")).not.toBe("pimple-patch");
    expect(guessType([], "Pimple Spot Gel")).not.toBe("pimple-patch");
  });

  it("does not call a dark-spot corrector a pimple patch just for saying spot", () => {
    // "spot" alone used to be a trigger word, so a hyperpigmentation product
    // — a real, distinct skincare category, nothing to do with acne — was
    // wrongly typed and scored as a pimple patch (found on PR #129). "spot"
    // still works as a filler word between an acne word and "patch", so the
    // existing "Acne Spot Patch"/"Acne Spot Healing Patch" cases are
    // unaffected.
    expect(guessType([], "Dark Spot Corrector Patch")).not.toBe("pimple-patch");
  });

  // Codex found all three of these on PR #129.
  it("prefers every mask and patch rule over the cleanser catch-all", () => {
    expect(guessType([], "Deep Cleansing Mask")).toBe("face-mask");
    expect(guessType([], "Masque nettoyant à l'argile")).toBe("face-mask");
    expect(guessType([], "Maschera detergente purificante")).toBe("face-mask");
  });

  it("allows descriptor words between the acne/pimple/blemish word and patch", () => {
    // COSRX's real product name — neither "acne" nor "pimple" alone reached
    // "patch" without this.
    expect(guessType([], "Acne Pimple Master Patch")).toBe("pimple-patch");
    expect(guessType([], "Acne Cover Patch")).toBe("pimple-patch");
    expect(guessType([], "Acne Spot Healing Patch")).toBe("pimple-patch");
  });

  it("stays unknown for an untagged foreign-language hair mask, rather than asserting face-mask", () => {
    expect(guessType([], "Masque capillaire réparateur")).not.toBe("face-mask");
    expect(guessType([], "Mascarilla capilar nutritiva")).not.toBe("face-mask");
    // The confirmed real face-mask examples still resolve correctly —
    // this exclusion must not catch them too.
    expect(guessType([], "Reinigende Tonerde-Maske")).toBe("face-mask");
  });

  // Codex found both of these on the second review round of PR #129.
  it("stays unknown for an English-spelled hair masque and the Italian 'capillare' variant", () => {
    expect(guessType([], "Intense Hydrating Hair Masque")).not.toBe("face-mask");
    expect(guessType([], "Maschera capillare nutriente")).not.toBe("face-mask");
  });

  it("stays unknown for a foot, hand or lip mask, rather than asserting face-mask", () => {
    // None of these say "sleeping"/"night"/"overnight", so this actually
    // exercises the face-mask fallback's exclusion rather than the separate
    // night-mask rule above it.
    expect(guessType([], "Purifying Foot Mask")).not.toBe("face-mask");
    expect(guessType([], "Hydrating Hand Mask")).not.toBe("face-mask");
    expect(guessType([], "Moisture Lip Mask")).not.toBe("face-mask");
  });

  // Codex found all four of these on the third review round of PR #129 —
  // the same body-part-exclusion gap as the English one above, just in
  // French, Spanish and Italian.
  it("stays unknown for a French, Spanish or Italian hand/foot/lip/hair mask", () => {
    expect(guessType([], "Masque pour les mains")).not.toBe("face-mask");
    expect(guessType([], "Mascarilla para pies")).not.toBe("face-mask");
    expect(guessType([], "Maschera labbra")).not.toBe("face-mask");
    expect(guessType([], "Masque pour cheveux")).not.toBe("face-mask");
  });

  // Codex found this on the fourth review round of PR #129: with a
  // descriptor word between the format word and "mask"/"patch", the
  // specific rules missed and these fell through to the generic face-mask
  // rule instead, discounting benefit weight from 1 to 0.5.
  it("allows descriptor words before the format word for eye-patch/night-mask/sheet-mask/hair-mask, same as pimple-patch", () => {
    expect(guessType([], "Eye Gel Mask")).toBe("eye-patch");
    expect(guessType([], "Overnight Face Mask")).toBe("night-mask");
    expect(guessType([], "Hydrating Sheet Face Mask")).toBe("sheet-mask");
    expect(guessType([], "Argan Repair Hair Mask")).toBe("hair-mask");
  });

  it("still matches the tight zero/one-separator compound form for eye-patch", () => {
    expect(guessType([], "Cettua Hydrogel Eyepatch Set")).toBe("eye-patch");
    expect(guessType([], "Overnight Anti-Aging Eye-Patch")).toBe("eye-patch");
  });

  // Codex found this on the fifth review round of PR #129: the
  // descriptor-bearing eye-patch branch above also swallowed "pad" with a
  // filler word in between, wrongly claiming a rinse/wipe-off product.
  it("does not call an eye-cleansing pad an eye patch just because a descriptor word sits before 'pad'", () => {
    expect(guessType([], "Gentle Eye Cleansing Pads")).toBe("cleanser");
    // The tight (no-descriptor) "pad" match is unaffected.
    expect(guessType([], "Eye Pad Mask Paradise Punch")).toBe("eye-patch");
  });

  // Codex found this on the sixth review round of PR #129: night-mask's
  // filler-word slot doesn't know "hair"/"sheet" are reserved trigger words
  // for the more specific rules further down the table, so it was winning
  // first instead of falling through to them.
  it("does not let night-mask's descriptor slot swallow hair-mask or sheet-mask", () => {
    expect(guessType([], "Overnight Hair Mask")).toBe("hair-mask");
    expect(guessType([], "Overnight Sheet Mask")).toBe("sheet-mask");
    // A genuinely generic descriptor still resolves to night-mask.
    expect(guessType([], "Overnight Face Mask")).toBe("night-mask");
  });

  it.each([
    "Overnight Foot Mask",
    "Sleeping Hand Mask",
    "Overnight Lip Mask",
    "Sleeping Body Mask",
    "Overnight Neck Mask",
  ])("keeps a body-part mask out of the face-oriented night-mask type: %s", (name: string) => {
    expect(guessType([], name)).toBe("unknown");
  });

  it("classifies mask tags independently from unrelated broad category tags", () => {
    expect(guessType(["en:hair-care", "en:face-masks"], "Brand X")).toBe("face-mask");
    expect(guessType(["en:skin-care", "en:hair-masks"], "Brand X")).toBe("hair-mask");
    expect(guessType(["en:face-masks"], "Overnight Hair Mask")).toBe("hair-mask");
    expect(guessType(["en:face-masks"], "Overnight Foot Mask")).toBe("unknown");
  });

  // Codex found this on the seventh review round of PR #129: the bare tight
  // "eye"+"pad" match had no way to tell a real eye patch apart from a
  // rinse/wipe-off cleansing or makeup-remover pad.
  it("does not call a cleansing or makeup-remover eye pad an eye patch", () => {
    expect(guessType([], "Cleansing Eye Pads")).toBe("cleanser");
    expect(guessType([], "Eye Pads Makeup Remover")).not.toBe("eye-patch");
    // A real eye-pad product with no cleansing/remover context still
    // resolves correctly.
    expect(guessType([], "Anti-Aging Hydrogel Eye Pads")).toBe("eye-patch");
  });

  it("recognizes a reversed 'mask ... sheet' name as sheet-mask, not the generic fallback", () => {
    expect(guessType([], "Face Mask Sheet")).toBe("sheet-mask");
    expect(guessType([], "Compressed Facial Mask Sheet")).toBe("sheet-mask");
  });
});
