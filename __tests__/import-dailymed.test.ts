import fs from "node:fs";
import path from "node:path";

import {
  activeIngredients,
  formulaKey,
  identityKey,
  inactiveIngredients,
  parseTitle,
  tidy,
  toRow,
} from "../scripts/import-dailymed.mjs";

/**
 * The DailyMed importer's parsing and gates.
 *
 * Step 10's done-when is "DailyMed sunscreens appear with public-domain
 * attribution", and the part worth pinning is everything between the label and
 * the row: SPL titles, the inactive-ingredient extraction, and the identity
 * key that stops one bottle being imported five times.
 *
 * The XML fixtures are shortened from real SPLs fetched while this was
 * written, keeping the structure that matters — in particular that the phrase
 * "INACTIVE INGREDIENT SECTION" appears *before* the printed list, which is
 * what makes taking the first match wrong.
 */

function expectKept<T>(result: T | string): T {
  if (typeof result === "string") {
    throw new Error(`expected the row to be kept, but it was rejected: ${result}`);
  }
  return result;
}

const KNOWN = new Set([
  "zinc oxide",
  "butyl methoxydibenzoylmethane",
  "ethylhexyl salicylate",
  "octocrylene",
  "homosalate",
  "water",
  "c15-19 alkane",
  "silica",
  "tocopheryl acetate",
  "glyceryl stearate",
  "zinc oxide",
  "undecane",
  "tribehenin",
]);

/** The shape of a real SPL around the part this importer reads. */
function splXml(inactiveLine: string): string {
  return (
    `<document><title>x</title>` +
    `<component><section><code displayName="INACTIVE INGREDIENT SECTION"/>` +
    `<text><paragraph>Inactive Ingredients ${inactiveLine}</paragraph></text>` +
    `</section></component>` +
    `<component><section><title>Questions?</title><text>Call 1-800-000-0000</text></section></component>` +
    `</document>`
  );
}

const SUMMARY = {
  setid: "192892b0-5632-40c5-a9b8-dcecdbcf2553",
  title: "SQWEEN MINERAL SUNSCREEN BROAD SPECTRUM SPF 30 PINK (ZINC OXIDE) CREAM [SQWEEN LLC]",
  published_date: "Sep 14, 2026",
};

describe("reading a DailyMed label", () => {
  it("splits a title into product name and labeler", () => {
    expect(parseTitle(SUMMARY.title)).toEqual({
      name: "SQWEEN MINERAL SUNSCREEN BROAD SPECTRUM SPF 30 PINK",
      labeler: "SQWEEN LLC",
    });
  });

  it("survives a title with no labeler or no parenthetical", () => {
    expect(parseTitle("PLAIN SUNSCREEN SPF 50").name).toBe("PLAIN SUNSCREEN SPF 50");
    expect(parseTitle("PLAIN SUNSCREEN SPF 50").labeler).toBeNull();
    expect(parseTitle("NAMED (AVOBENZONE) LOTION").name).toBe("NAMED");
  });

  // The bug this function was written around: "INACTIVE INGREDIENT SECTION" is
  // a code label that appears before the printed list, so matching the first
  // occurrence captures the header rather than the ingredients.
  it("takes the printed list, not the section header before it", () => {
    const text = inactiveIngredients(splXml("Water, Silica, Undecane"));
    expect(text).toBe("Water, Silica, Undecane");
    expect(text).not.toMatch(/SECTION/i);
  });

  it("stops at whatever shares the back of the label", () => {
    const xml = splXml("Water, Silica Questions? Call 1-800-000-0000");
    expect(inactiveIngredients(xml)).toBe("Water, Silica");
  });

  it("returns null when there is no inactive-ingredient section at all", () => {
    expect(inactiveIngredients("<document><title>x</title></document>")).toBeNull();
  });
});

describe("building a row", () => {
  it("keeps a real sunscreen, typed and attributed", () => {
    const xml = splXml(
      "Water, C15-19 Alkane, Silica, Tocopheryl Acetate, Glyceryl Stearate, Undecane"
    );
    const row = expectKept(toRow(SUMMARY, xml, KNOWN, []));

    expect(row.product.id).toBe(`dailymed-${SUMMARY.setid}`);
    expect(row.product.type).toBe("sunscreen");
    expect(row.product.source).toBe("dailymed");
    expect(row.product.attribution).toMatch(/public domain/i);
    // Every row from this source is licence-free, so it never expires.
    expect(row.product.expires_at).toBeNull();
    // No barcode: DailyMed identifies by NDC, which is not what a camera reads.
    expect(row.product.barcode).toBeNull();
    // Zinc oxide leads: the title's active comes first. See the UV-filter
    // block below.
    expect(row.ingredients[0].inci_name).toBe("zinc oxide");
    expect(row.ingredients[1].inci_name).toBe("water");
  });

  it("title-cases the shouted names DailyMed publishes", () => {
    const xml = splXml("Water, Silica, Undecane");
    const row = expectKept(toRow(SUMMARY, xml, KNOWN, []));
    // Title-cased, with the company suffix left as the acronym it is.
    expect(row.product.brand).toBe("Sqween LLC");
    expect(row.product.name).toContain("Sqween Mineral Sunscreen");
    expect(row.product.name).toContain("SPF");
  });

  it("names why it rejected, so a run can count them", () => {
    expect(toRow({ ...SUMMARY, title: "" }, splXml("Water, Silica"), KNOWN, [])).toBe(
      "no name or setid"
    );
    expect(toRow(SUMMARY, "<document/>", KNOWN, [])).toBe("no inactive-ingredient section");
    // A title whose parenthetical is not a filter list, so nothing is
    // prepended and the single inactive really is the whole formula.
    expect(
      toRow({ ...SUMMARY, title: "PLAIN (SOMETHING ELSE) CREAM [B]" }, splXml("Water"), KNOWN, [])
    ).toBe("fewer than 2 parsed ingredients");
  });

  // The failure mode measured on live data: two SPLs in ten print their
  // ingredients with no separator at all. That collapses to one over-length
  // token, and guessing at the boundaries is not worth it when there are 5,801
  // candidates.
  it("rejects a label printed without separators rather than guessing", () => {
    const xml = splXml("Purified Water Aloe Barbadensis Leaf Juice Dicaprylyl Carbonate Butyloctyl Salicylate");
    expect(typeof toRow(SUMMARY, xml, KNOWN, [])).toBe("string");
  });

  it("rejects a formula the dictionary does not recognise", () => {
    const xml = splXml("zzz alpha, zzz beta, zzz gamma, zzz delta, zzz epsilon");
    expect(toRow(SUMMARY, xml, KNOWN, [])).toBe("formula not recognised by the dictionary");
  });
});

describe("one bottle, many labels", () => {
  /**
   * DailyMed publishes one SPL per labeler per revision, so the same product
   * appears repeatedly under different setids — a single sunscreen turned up
   * five times in a ten-row sample while this was written. Without an identity
   * key the catalogue fills with duplicates of one bottle.
   */
  it("treats two labels with the same title as one product", () => {
    expect(identityKey("SQWEEN SUNSCREEN (ZINC OXIDE) CREAM [SQWEEN LLC]")).toBe(
      identityKey("sqween  sunscreen  (zinc oxide)  cream [sqween llc] ")
    );
  });

  it("keeps genuinely different products apart", () => {
    expect(identityKey("A SUNSCREEN SPF 30 (ZINC OXIDE) CREAM [B]")).not.toBe(
      identityKey("A SUNSCREEN SPF 50 (ZINC OXIDE) CREAM [B]")
    );
  });

  /**
   * Keyed on the whole title rather than the brand and trimmed name it used
   * to be. `parseTitle` strips the parenthetical and the dosage form, which is
   * exactly where two different sunscreens differ — both of these reduced to
   * "b|a", so the second was skipped before its label was ever fetched and
   * `formulaKey` never got to keep them apart. A mineral and a chemical
   * sunscreen are not the same product.
   */
  it("does not collapse a mineral and a chemical sunscreen sharing a name", () => {
    expect(identityKey("A (ZINC OXIDE) CREAM [B]")).not.toBe(
      identityKey("A (AVOBENZONE,OCTOCRYLENE) CREAM [B]")
    );
  });
});

describe("tidy", () => {
  it("title-cases but keeps the acronyms that are not words", () => {
    expect(tidy("SQWEEN LLC")).toBe("Sqween LLC");
    expect(tidy("MINERAL SUNSCREEN SPF 30")).toBe("Mineral Sunscreen SPF 30");
  });
});

describe("the same bottle under two labelers", () => {
  /**
   * Brand and name are not enough on their own. A brand and its contract
   * manufacturer both file an SPL for the same product under different names —
   * measured on fifty live labels, "Atlantis Laboratories, INC." and "Sqween
   * LLC" publish an identical twenty-five ingredient list in identical order.
   * Scoring reads the formula and nothing else, so a second copy is a row that
   * can only ever repeat the first.
   */
  it("collapses two labels carrying the same formula", () => {
    const a = formulaKey([{ inci_name: "water" }, { inci_name: "silica" }]);
    const b = formulaKey([{ inci_name: "water" }, { inci_name: "silica" }]);
    expect(a).toBe(b);
  });

  it("keeps the same names in a different order apart", () => {
    // INCI order is concentration order, so this really is a different
    // product and really does score differently.
    const a = formulaKey([{ inci_name: "water" }, { inci_name: "silica" }]);
    const b = formulaKey([{ inci_name: "silica" }, { inci_name: "water" }]);
    expect(a).not.toBe(b);
  });
});

describe("a sunscreen keeps its UV filters", () => {
  /**
   * DailyMed separates actives from inactives, and an earlier version of this
   * importer stored only the inactive list — so every imported sunscreen
   * arrived without the ingredients it exists for. `lib/rules.ts` scores zinc
   * oxide and titanium dioxide explicitly, so the omission changed what a user
   * was told.
   */
  it("reads the filters off the title and puts them first", () => {
    const xml = splXml("Water, Silica, Undecane");
    const row = expectKept(toRow(SUMMARY, xml, KNOWN, []));
    expect(row.ingredients[0].inci_name).toBe("zinc oxide");
    expect(row.ingredients[1].inci_name).toBe("water");
  });

  /**
   * The nomenclature problem. US labels print drug names; the dictionary holds
   * INCI names, and they are not the same words — "avobenzone" is absent from
   * the live dictionary while "butyl methoxydibenzoylmethane" is present.
   * Prepending the printed names raw would write unmatched stubs into the
   * shared ingredient table and drag chemical sunscreens toward the gate.
   */
  it("translates US drug names into the INCI names the dictionary holds", () => {
    expect(activeIngredients("X (AVOBENZONE,OCTISALATE) LOTION [Y]")).toEqual([
      "butyl methoxydibenzoylmethane",
      "ethylhexyl salicylate",
    ]);
    expect(activeIngredients("X (ZINC OXIDE) CREAM [Y]")).toEqual(["zinc oxide"]);
    // "A, B, C, AND D" is ordinary list punctuation and real titles use it.
    // Without handling the conjunction the all-or-nothing rule below discards
    // the whole list and a genuine chemical sunscreen imports with no filters.
    expect(
      activeIngredients("X (AVOBENZONE, HOMOSALATE, OCTISALATE, AND OCTOCRYLENE) SPRAY [Y]")
    ).toEqual([
      "butyl methoxydibenzoylmethane",
      "homosalate",
      "ethylhexyl salicylate",
      "octocrylene",
    ]);
  });

  /**
   * Not every parenthetical is an active list. One real title reads
   * "(TINTED LIP GLOSS WITH SPF 30 SUNSCREEN)" — a description. Trusting it
   * partially would write that phrase into the catalogue as an ingredient, so
   * every part must resolve or none of it is used.
   */
  it("discards a parenthetical that is a description, not a filter list", () => {
    expect(activeIngredients("X (TINTED LIP GLOSS WITH SPF 30 SUNSCREEN) [Y]")).toEqual([]);
    expect(activeIngredients("X (ZINC OXIDE, SOMETHING ELSE) [Y]")).toEqual([]);
    expect(activeIngredients("X CREAM [Y]")).toEqual([]);
  });

  it("does not list a filter twice when it also appears among the inactives", () => {
    const xml = splXml("Water, Zinc Oxide, Silica");
    const row = expectKept(toRow(SUMMARY, xml, KNOWN, []));
    const zinc = row.ingredients.filter((i: { inci_name: string }) => i.inci_name === "zinc oxide");
    expect(zinc).toHaveLength(1);
    expect(zinc[0].position).toBe(0);
  });

  /**
   * The consequence for deduplication: two sunscreens sharing an inactive base
   * but using different filters are different products and must not collapse.
   */
  it("keeps a mineral and a chemical sunscreen apart", () => {
    const xml = splXml("Water, Silica, Undecane");
    const mineral = expectKept(toRow({ ...SUMMARY, title: "A (ZINC OXIDE) CREAM [B]" }, xml, KNOWN, []));
    const chemical = expectKept(
      toRow({ ...SUMMARY, title: "A (AVOBENZONE,OCTOCRYLENE) CREAM [B]" }, xml, KNOWN, [])
    );
    expect(formulaKey(mineral.ingredients)).not.toBe(formulaKey(chemical.ingredients));
  });
});

describe("what came back from a sunscreen search but is not skincare", () => {
  /**
   * The step 4 lesson, arriving again from a different direction. Widening a
   * source without a relevance filter filled the catalogue with deodorant and
   * shampoo, because the new filter selected for data completeness while the
   * old hand-written brand list had been quietly supplying relevance.
   *
   * "Sunscreen" as a search term matches any SPF product, and lip balms carry
   * SPF: four of twelve kept rows in a thirty-label sample were lip products.
   * They have real formulas, but a face-first catalogue has no lip category to
   * file them under, so they would arrive typed "sunscreen" — the same
   * wrong-but-confident answer `guessType` was changed to stop giving.
   */
  it("rejects lip balms and glosses that carry SPF", () => {
    const xml = splXml("Water, Silica");
    for (const title of [
      "JACK BLACK LAVENDER LIP BALM (LIP BALM SUNSCREEN) OINTMENT [J]",
      "MESTRACT TINTED LIP GLOSS WITH SPF 30 SUNSCREEN (X) [Y]",
      "INTENSE THERAPY LIP BALM PINEAPPLE MINT (SUNSCREEN SKIN PROTECTANT LIP BALM) [Z]",
    ]) {
      expect(toRow({ ...SUMMARY, title }, xml, KNOWN, [])).toBe("not a skincare product");
    }
  });

  it("keeps a face sunscreen", () => {
    const xml = splXml("Water, Silica");
    const row = expectKept(
      toRow({ ...SUMMARY, title: "SQWEEN MINERAL SUNSCREEN SPF 30 (ZINC OXIDE) CREAM [S]" }, xml, KNOWN, [])
    );
    expect(row.product.type).toBe("sunscreen");
  });

  /**
   * Written after the regex for the check above was committed carrying a
   * literal 0x08 byte where a word boundary was meant — the second time that
   * exact corruption has happened in this repository (see `titleCase` in
   * `lib/matching.ts`). A pattern that silently matches nothing is invisible
   * in review and invisible in a passing test that only asserts the happy
   * path, so the bytes are checked directly.
   */
  it("has no control characters in its source", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "scripts", "import-dailymed.mjs"),
      "utf8"
    );
    const offenders = [...src].filter((c) => {
      const code = c.charCodeAt(0);
      // Compared as numbers, not as escaped literals: this very line was
      // written twice with a mangled escape before it survived intact.
      return code < 32 && code !== 10 && code !== 13 && code !== 9;
    });
    expect(offenders).toHaveLength(0);
  });
});

describe("filters the title does not name", () => {
  /**
   * The title convention is common, not universal — "(SUNSCREEN)" and
   * "(BROAD SPECTRUM SPF30)" are real examples. A third of kept products were
   * still arriving with no actives once the title path alone worked.
   *
   * The label body has them, but does not punctuate like a title: a real Drug
   * Facts panel flattens to "Octisalate 3.0% Sunscreen Octinoxate 7.5%
   * Sunscreen Zinc Oxide 8.0% Sunscreen" — no separator anywhere. Splitting
   * that yields one unrecognisable token, so the names are scanned for
   * instead.
   */
  const labelWith = (actives: string) =>
    `<x><y>Active Ingredients ${actives}</y><y>Inactive Ingredients Water, Silica</y></x>`;

  it("reads filters out of an unpunctuated Drug Facts panel", () => {
    expect(
      activeIngredients(
        "A (SUNSCREEN) LOTION [B]",
        labelWith("Octisalate 3.0% Sunscreen Octinoxate 7.5% Sunscreen Zinc Oxide 8.0% Sunscreen Uses Helps")
      )
    ).toEqual(["ethylhexyl salicylate", "ethylhexyl methoxycinnamate", "zinc oxide"]);
  });

  it("orders them as the label does, because position is concentration", () => {
    expect(
      activeIngredients("A (BROAD SPECTRUM SPF30) CREAM [B]", labelWith("Zinc Oxide 7.5% Titanium Dioxide 3.2%"))
    ).toEqual(["zinc oxide", "titanium dioxide"]);
  });

  /**
   * "ACTIVE INGREDIENT" is a substring of "INACTIVE INGREDIENT". Without a
   * word boundary the search finds the inactive list and stores it as the
   * actives — there is no boundary between the "n" of "Inactive" and the "a"
   * of "active", which is what keeps them apart.
   */
  it("does not mistake the inactive list for the active one", () => {
    expect(
      activeIngredients("A (SUNSCREEN) [B]", "<x><y>Inactive Ingredients Water, Zinc Oxide, Silica</y></x>")
    ).toEqual([]);
  });

  it("prefers the title when it names them", () => {
    expect(activeIngredients("A (ZINC OXIDE) CREAM [B]", labelWith("Avobenzone 2.2%"))).toEqual([
      "zinc oxide",
    ]);
  });

  it("returns nothing when the label names none", () => {
    expect(activeIngredients("A (SUNSCREEN) [B]", "<x>nothing here</x>")).toEqual([]);
  });
});

describe("the actives cannot rescue a malformed inactive list", () => {
  /**
   * A regression introduced by prepending the UV filters, and the reason the
   * gates now judge the inactive list on its own first.
   *
   * Some SPLs print their inactive ingredients with no separator, which parses
   * to one giant token — the gates exist to refuse exactly that. But filters
   * are recognised names by construction, so four of them in front of that one
   * junk token gives five ingredients at four recognised: 0.8, comfortably
   * past the threshold. The malformed label would have passed the gate it was
   * supposed to fail, stored as the filters plus one enormous ingredient with
   * every real inactive lost.
   */
  const FOUR_FILTERS = "A (AVOBENZONE, HOMOSALATE, OCTISALATE, AND OCTOCRYLENE) SPRAY [B]";

  it("still rejects an unpunctuated label that carries four known filters", () => {
    const xml = splXml(
      "Purified Water Aloe Barbadensis Leaf Juice Dicaprylyl Carbonate Butyloctyl Salicylate Isononyl Isononanoate"
    );
    // Caught by the count gate, since the unpunctuated line yields one token —
    // which gate stops it is incidental, that it is stopped is not.
    expect(typeof toRow({ ...SUMMARY, title: FOUR_FILTERS }, xml, KNOWN, [])).toBe("string");
  });

  /**
   * The arithmetic that made this worth fixing rather than reasoning about.
   *
   * Two unrecognised inactives on their own are 0/2 — nothing like believable.
   * Prepend four recognised filters and it becomes 4/6, or 0.67, past the 0.6
   * threshold. So a formula the gate would refuse outright is admitted purely
   * because the product is a sunscreen.
   */
  it("rejects a formula the filters alone would have lifted over the threshold", () => {
    const xml = splXml("zzz one, zzz two");
    expect(toRow({ ...SUMMARY, title: FOUR_FILTERS }, xml, KNOWN, [])).toBe(
      "formula not recognised by the dictionary"
    );
  });

  it("still keeps a well-formed label with the same filters", () => {
    const xml = splXml("Water, Silica, Glyceryl Stearate, Tocopheryl Acetate");
    const title = "A (AVOBENZONE, HOMOSALATE, OCTISALATE, AND OCTOCRYLENE) SPRAY [B]";
    const row = expectKept(toRow({ ...SUMMARY, title }, xml, KNOWN, []));
    expect(row.ingredients[0].inci_name).toBe("butyl methoxydibenzoylmethane");
    expect(row.ingredients.map((i: { inci_name: string }) => i.inci_name)).toContain("water");
  });
});

describe("one filter name inside another", () => {
  const labelWith = (actives: string) =>
    `<x><y>Active Ingredients ${actives}</y><y>Inactive Ingredients Water, Silica</y></x>`;

  /**
   * "oxybenzone" is a substring of "dioxybenzone" and both are filters in
   * their own right, so a plain substring scan reported benzophenone-8, which
   * is correct, *and* benzophenone-3, which is not in the product at all.
   *
   * An invented ingredient is worse than a missing one: it is scored, shown to
   * the user as fact, and folded into the key that decides whether two
   * products are the same.
   */
  it("does not invent benzophenone-3 from a dioxybenzone label", () => {
    expect(activeIngredients("A (SUNSCREEN) [B]", labelWith("Dioxybenzone 3% Sunscreen"))).toEqual([
      "benzophenone-8",
    ]);
  });

  it("still finds oxybenzone when the label really names it", () => {
    expect(activeIngredients("A (SUNSCREEN) [B]", labelWith("Oxybenzone 4% Sunscreen"))).toEqual([
      "benzophenone-3",
    ]);
  });

  it("finds both when both are present", () => {
    expect(
      activeIngredients("A (SUNSCREEN) [B]", labelWith("Dioxybenzone 3% Oxybenzone 4%"))
    ).toEqual(["benzophenone-8", "benzophenone-3"]);
  });
});
