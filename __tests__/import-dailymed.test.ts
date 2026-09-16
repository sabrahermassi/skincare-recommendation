import {
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
    expect(row.ingredients[0].inci_name).toBe("water");
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
    expect(toRow(SUMMARY, splXml("Water"), KNOWN, [])).toBe("fewer than 2 parsed ingredients");
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
  it("treats the same brand and name as one product", () => {
    const a = identityKey({ brand: "SQWEEN LLC", name: "Sqween Mineral Sunscreen SPF 30" });
    const b = identityKey({ brand: "Sqween  LLC", name: "SQWEEN MINERAL SUNSCREEN SPF 30" });
    expect(a).toBe(b);
  });

  it("keeps genuinely different products apart", () => {
    const a = identityKey({ brand: "SQWEEN LLC", name: "Sunscreen SPF 30" });
    const b = identityKey({ brand: "SQWEEN LLC", name: "Sunscreen SPF 50" });
    expect(a).not.toBe(b);
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
