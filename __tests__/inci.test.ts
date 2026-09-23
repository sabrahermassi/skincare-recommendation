import {
  commonNameFor,
  findListByDictionary,
  fuzzyKnownName,
  isPlausibleIngredientName,
  normalise,
  parseIngredientBlock,
  reconstructFromDictionary,
  resolveKnownName,
  salvageKnownNames,
  splitRunTogether,
  splitSlashList,
  squashKey,
} from "@/lib/inci";

/**
 * Names taken from the live dictionary's colon-containing rows — the shapes the
 * heading fixes cannot catch, because there is no heading to strip.
 */
describe("isPlausibleIngredientName", () => {
  it.each([
    "package labeling: label.jpg",
    "water package labeling: outer label.jpg inner label.jpg",
    "korea distribuitor: promo plus srl",
    "netezeşte şi catifelează tenul. mod de utilizare: aplică masca pe tenul curat",
    "onben: '#f4f7f1",
    "silice: 10.6 mg/ kons cations 2715 ng ca 51",
    "label.jpg",
  ])("rejects a fragment that is not a name: %s", (name: string) => {
    expect(isPlausibleIngredientName(name)).toBe(false);
  });

  it.each([
    "ci 77268:1",
    "pigment red 57:1",
    "basic violet 11:1",
    "aqua",
    "1,2-hexanediol",
    "pentaerythrityl tetra-di-t-butyl hydroxyhydrocinnamate",
  ])("keeps a real name: %s", (name: string) => {
    expect(isPlausibleIngredientName(name)).toBe(true);
  });

  it("skips only the word limit when asked, so junk after word eight is still caught", () => {
    const long = "aspergillus lactobacillus leuconostoc pediococcus saccharomyces citrus unshiu fruit ferment extract";
    expect(isPlausibleIngredientName(long)).toBe(false);
    expect(isPlausibleIngredientName(long, true)).toBe(true);
    expect(isPlausibleIngredientName("one two three four five six seven eight package labeling: label.jpg", true)).toBe(false);
    expect(isPlausibleIngredientName("one two three four five six seven eight nine www.example.com", true)).toBe(false);
  });

  it("rejects a name longer than eight words", () => {
    expect(isPlausibleIngredientName("one two three four five six seven eight")).toBe(true);
    expect(isPlausibleIngredientName("one two three four five six seven eight nine")).toBe(false);
  });
});

describe("resolveKnownName", () => {
  const dictionary = new Set([
    "aqua",
    "water",
    "parfum",
    "glycerin",
    "behenyl alcohol",
    "ci 77891",
    "titanium dioxide",
    "hydroxyethyl acrylate",
  ]);

  it.each([
    ["aqua/water/eau", "aqua"],
    ["aqua/water", "aqua"],
    ["aqua / water", "aqua"],
    ["parfum/fragrance", "parfum"],
    ["ci 77891/titanium dioxide", "ci 77891"],
    ["gly cerin", "glycerin"],
    ["be henyl alcohol", "behenyl alcohol"],
  ])("resolves %s to %s", (name: string, expected: string) => {
    expect(resolveKnownName(name, dictionary)).toBe(expected);
  });

  it("leaves a name the dictionary already holds alone", () => {
    expect(resolveKnownName("glycerin", dictionary)).toBe("glycerin");
  });

  it("does not split a real name that merely contains a slash", () => {
    expect(
      resolveKnownName("hydroxyethyl acrylate/sodium acryloyldimethyl taurate copolymer", dictionary)
    ).toBe("hydroxyethyl acrylate/sodium acryloyldimethyl taurate copolymer");
  });

  it("leaves a name it cannot place unchanged", () => {
    expect(resolveKnownName("helianthus annus seed oil", dictionary)).toBe("helianthus annus seed oil");
  });

  it("returns the dictionary name, not the alias, when a slash name is anchored on an alias", () => {
    const aliases = new Map([["glycérine", "glycerin"]]);
    expect(resolveKnownName("glycérine/vegetable", new Set(["glycerin"]), aliases)).toBe("glycerin");
  });

  it("counts a mapped common name as a known part, so it is not swallowed by the first ingredient", () => {
    const known = new Set(["aqua", "petrolatum"]);
    expect(resolveKnownName("aqua / petroleum jelly", known)).toBe("aqua / petroleum jelly");
    expect(resolveKnownName("petrolatum/petroleum jelly", known)).toBe("petrolatum");
  });

  it("does not fold two different known ingredients into the first", () => {
    expect(resolveKnownName("aqua / glycerin", dictionary)).toBe("aqua / glycerin");
    expect(resolveKnownName("glycerin/behenyl alcohol", dictionary)).toBe("glycerin/behenyl alcohol");
  });

  it("resolves through parseIngredientBlock when a dictionary is supplied", () => {
    const parsed = parseIngredientBlock("Aqua/Water/Eau, Gly cerin, Parfum/Fragrance, Glycerin", dictionary);
    expect(parsed.map((p) => p.inci_name)).toEqual(["aqua", "glycerin", "parfum"]);
  });
});

describe("full stops that are not separators", () => {
  const names = (text: string) => parseIngredientBlock(text).map((p) => p.inci_name);

  it("keeps an abbreviation whole: Vit. E", () => {
    expect(names("Aqua, Vit. E, Glycerin, Panthenol")).toEqual(["aqua", "vit. e", "glycerin", "panthenol"]);
  });

  it("keeps a genus abbreviated at the start of an item: C. Sinensis", () => {
    expect(names("C. Sinensis Leaf Extract, Aqua, Glycerin, Panthenol")).toEqual([
      "c. sinensis leaf extract",
      "aqua",
      "glycerin",
      "panthenol",
    ]);
    expect(names("Aqua. C. Sinensis Leaf Extract. Glycerin. Panthenol")).toEqual([
      "aqua",
      "c. sinensis leaf extract",
      "glycerin",
      "panthenol",
    ]);
  });

  it("still splits a label printed with full stops for commas", () => {
    expect(names("Benzoic Acid. Caprylyl Glycol. Glycerin. Aqua")).toEqual([
      "benzoic acid",
      "caprylyl glycol",
      "glycerin",
      "aqua",
    ]);
  });

  it("still ends a name at a lone letter that follows other words: Vitamin E.", () => {
    expect(names("Vitamin E. Glycerin. Aqua. Panthenol")).toEqual(["vitamin e", "glycerin", "aqua", "panthenol"]);
  });
});

describe("a long real name without a dictionary", () => {
  it("is kept by the dictionary-free first pass instead of being dropped for its length", () => {
    // Ten words, under the 120-character cap that applies on every path.
    const long = "aspergillus lactobacillus leuconostoc pediococcus saccharomyces citrus unshiu fruit ferment extract";
    const parsed = parseIngredientBlock(`Aqua, Glycerin, Panthenol, Allantoin, ${long}`).map((p) => p.inci_name);
    expect(parsed).toContain(long);
    expect(parsed).toHaveLength(5);
  });
});

describe("splitSlashList", () => {
  const dictionary = new Set(["aqua", "glycerin", "niacinamide", "prunus armeniaca kernel oil"]);

  it("returns the separate names when every part is a known ingredient", () => {
    expect(splitSlashList("aqua / glycerin", dictionary)).toEqual(["aqua", "glycerin"]);
  });

  it("reads an alias part as its dictionary name", () => {
    const aliases = new Map([["apricot kernel oil", "prunus armeniaca kernel oil"]]);
    expect(splitSlashList("glycerin/apricot kernel oil", dictionary, aliases)).toEqual([
      "glycerin",
      "prunus armeniaca kernel oil",
    ]);
  });

  it("reads a mapped common name as its dictionary name", () => {
    expect(splitSlashList("aqua / petroleum jelly", new Set(["aqua", "petrolatum"]))).toEqual(["aqua", "petrolatum"]);
  });

  it("leaves the token alone when any part is unknown", () => {
    expect(splitSlashList("aqua/huile minerale", dictionary)).toEqual(["aqua/huile minerale"]);
    expect(splitSlashList("glycerin", dictionary)).toEqual(["glycerin"]);
  });

  it("keeps both ingredients when a slash list sits inside a formula", () => {
    const parsed = parseIngredientBlock("Aqua / Glycerin, Niacinamide, Aqua, Glycerin", dictionary);
    expect(parsed.map((p) => p.inci_name)).toEqual(["aqua", "glycerin", "niacinamide"]);
  });
});

describe("resolveKnownName: spacing, spelling and common names", () => {
  const dictionary = new Set([
    "hydrogenated styrene/methyl styrene/indene copolymer",
    "hydroxyethyl acrylate/sodium acryloyldimethyl taurate copolymer",
    "sodium lauryl sulfate",
    "simmondsia chinensis seed oil",
    "aroma",
    "parfum",
    "paraffinum liquidum",
    "kojic dipalmitate",
    "peg-40 stearate",
    "peg-4 stearate",
    "styrene methylstyrene indene copolymer",
    "styrene/methylstyrene/indene copolymer",
  ]);

  it("matches the same letters under different spacing and punctuation", () => {
    expect(resolveKnownName("hydrogenated styrene/methylstyrene/indene copolymer", dictionary)).toBe(
      "hydrogenated styrene/methyl styrene/indene copolymer"
    );
    expect(resolveKnownName("hydroxyethyl acrylate/sodium acryloyldimethyltaurate copolymer", dictionary)).toBe(
      "hydroxyethyl acrylate/sodium acryloyldimethyl taurate copolymer"
    );
  });

  it("prefers the candidate fewest edits away when the dictionary holds a name twice", () => {
    expect(resolveKnownName("styrene methylstyrene indene co polymer", dictionary)).toBe(
      "styrene methylstyrene indene copolymer"
    );
  });

  it("keeps digits in the key, so peg-4 and peg-40 never meet", () => {
    expect(squashKey("peg-40 stearate")).not.toBe(squashKey("peg-4 stearate"));
    expect(resolveKnownName("peg 40 stearate", dictionary)).toBe("peg-40 stearate");
    expect(resolveKnownName("peg-400 stearate", dictionary)).toBe("peg-400 stearate");
  });

  // Found in review on #247: stripping every non-[a-z0-9] character
  // collapsed any two pure-CJK strings to the identical empty key (`""`),
  // so two unrelated Korean synonyms would bucket together in `squashIndex`
  // and an unresolved CJK fragment could get fuzzy-matched to whichever one
  // was nearest by edit distance, across the whole bucket — not narrowed to
  // same-content candidates the way a Latin name already is.
  it("keeps CJK characters in the key, so two different Korean names never share a squash bucket", () => {
    expect(squashKey("글리세린")).not.toBe(squashKey("나이아신아마이드"));
    expect(squashKey("글리세린")).toBe("글리세린");
  });

  it("reads a British spelling", () => {
    expect(resolveKnownName("sodium lauryl sulphate", dictionary)).toBe("sodium lauryl sulfate");
  });

  it.each([
    ["flavor", "aroma"],
    ["perfume", "parfum"],
    ["jojoba seed oil", "simmondsia chinensis seed oil"],
    ["mineral oil", "paraffinum liquidum"],
    ["kojic acid dipalmitate", "kojic dipalmitate"],
  ])("maps the common name %s to %s", (name: string, expected: string) => {
    expect(resolveKnownName(name, dictionary)).toBe(expected);
  });

  it("ignores a common name whose target the dictionary does not hold", () => {
    expect(resolveKnownName("argan oil", dictionary)).toBe("argan oil");
  });

  it("does not guess at the ambiguous common names", () => {
    expect(commonNameFor("iron oxides")).toBeUndefined();
    expect(commonNameFor("citrus aurantium peel oil")).toBeUndefined();
  });

  it("accepts an unfamiliar translated part after the slash, but not on a polymer name", () => {
    const known = new Set(["paraffinum liquidum", "mineral oil", "hydroxyethyl acrylate"]);
    expect(resolveKnownName("paraffinum liquidum/mineral oil/huile minerale", known)).toBe("paraffinum liquidum");
    expect(
      resolveKnownName("hydroxyethyl acrylate/sodium acryloyldimethyl taurate copolymer", known)
    ).toBe("hydroxyethyl acrylate/sodium acryloyldimethyl taurate copolymer");
  });

  it("finds the known name wherever it sits around the slash", () => {
    const known = new Set(["ci 77491", "titanium dioxide"]);
    expect(resolveKnownName("iron oxides/ci 77491", known)).toBe("ci 77491");
    expect(resolveKnownName("titanium dioxide nano / titanium dioxide", known)).toBe("titanium dioxide");
  });

  it("drops a bracket the label never closed", () => {
    const known = new Set(["aqua", "hyaluronic acid"]);
    expect(resolveKnownName("aqua (water", known)).toBe("aqua");
    expect(resolveKnownName("hyaluronic acid (3-8 kda", known)).toBe("hyaluronic acid");
    expect(resolveKnownName("aqua water)", known)).toBe("aqua water)");
  });

  it("counts an alias as a known part after the slash", () => {
    const known = new Set(["prunus armeniaca kernel oil"]);
    const aliases = new Map([["apricot kernel oil", "prunus armeniaca kernel oil"]]);
    expect(resolveKnownName("prunus armeniaca kernel oil/apricot kernel oil", known, aliases)).toBe(
      "prunus armeniaca kernel oil"
    );
  });
});

describe("resolveKnownName: unit annotations", () => {
  const dictionary = new Set(["homosalate", "octocrylene", "ethylhexyl salicylate", "ethylhexyl methoxycinnamate"]);

  it("drops a w/w or w/v unit printed after the name", () => {
    expect(resolveKnownName("homosalate w/w", dictionary)).toBe("homosalate");
    expect(resolveKnownName("octocrylene w/v", dictionary)).toBe("octocrylene");
  });

  it("drops a dose glued to or spaced after the name", () => {
    expect(resolveKnownName("homosalate100mg/g", dictionary)).toBe("homosalate");
    expect(resolveKnownName("octocrylene 50 mg/g", dictionary)).toBe("octocrylene");
    expect(resolveKnownName("octyl salicylate 50mg/g", dictionary)).toBe("ethylhexyl salicylate");
    expect(resolveKnownName("homosalate 10%", dictionary)).toBe("homosalate");
  });

  it("resolves the common UV-filter names after the unit is dropped", () => {
    expect(resolveKnownName("octyl salicylate w/w", dictionary)).toBe("ethylhexyl salicylate");
    expect(resolveKnownName("octyl methoxycinnamate", dictionary)).toBe("ethylhexyl methoxycinnamate");
  });

  it("reads a sunscreen label whose every filter carries a unit", () => {
    const parsed = parseIngredientBlock(
      "Homosalate w/w, Octocrylene w/w, Octyl Salicylate w/w, Glycerin",
      dictionary
    );
    expect(parsed.slice(0, 3).map((p) => p.inci_name)).toEqual(["homosalate", "octocrylene", "ethylhexyl salicylate"]);
  });
});

describe("salvageKnownNames", () => {
  const dictionary = new Set(["sodium sulfate", "ci 12490", "benzyl alcohol", "aqua", "water", "helianthus annuus seed oil", "alcohol"]);

  it("keeps each colon-separated piece that is a known name", () => {
    expect(salvageKnownNames("sodium sulfate: ci 12490", dictionary)).toEqual(["sodium sulfate", "ci 12490"]);
    expect(salvageKnownNames("preservatives: benzyl alcohol", dictionary)).toEqual(["benzyl alcohol"]);
  });

  it("finds a known name behind a batch number", () => {
    expect(salvageKnownNames("2050519 10 - aqua", dictionary)).toEqual(["aqua"]);
  });

  it("finds a known name behind heading text in other scripts", () => {
    expect(
      salvageKnownNames("ingrédients/ingredientes/ zyztatika/ingrediente/cbctabкm/sastojci helianthus annuus seed oil", dictionary)
    ).toEqual(["helianthus annuus seed oil"]);
  });

  it.each([
    ["ingrédients/ingredientes/ zyztatika/ingrediente/cbctabкm/sastojci Helianthus Annuus Seed Oil, Aqua, Glycerin, Panthenol"],
    ["INGREDIENTS/INGREDIENTES/ SASTOJCI/INGREDIENTE Helianthus Annuus Seed Oil, Aqua, Glycerin, Panthenol"],
  ])("keeps the first ingredient behind a stack of headings in several languages: %s", (text: string) => {
    expect(parseIngredientBlock(text, dictionary).map((p) => p.inci_name)).toEqual([
      "helianthus annuus seed oil",
      "aqua",
      "glycerin",
      "panthenol",
    ]);
  });

  it("does not reduce a real slash name the dictionary lacks to its last word", () => {
    const known = new Set(["dimethicone"]);
    expect(salvageKnownNames("peg/ppg-18/18 dimethicone", known)).toEqual([]);
    expect(
      parseIngredientBlock("Aqua, Peg/Ppg-18/18 Dimethicone, Glycerin, Panthenol", known).map((p) => p.inci_name)
    ).toContain("peg/ppg-18/18 dimethicone");
  });

  it("does not turn a sentence that ends in an ingredient into that ingredient", () => {
    expect(salvageKnownNames("free from alcohol", dictionary)).toEqual([]);
    expect(salvageKnownNames("made with natural water", dictionary)).toEqual([]);
  });

  it("returns nothing when no piece is a known name", () => {
    expect(salvageKnownNames("package labeling: label.jpg", dictionary)).toEqual([]);
  });

  it("works through the whole parser, keeping a known name the guard would have refused", () => {
    const parsed = parseIngredientBlock("Aqua, Sodium Sulfate: CI 12490, Preservatives: Benzyl Alcohol", dictionary);
    expect(parsed.map((p) => p.inci_name)).toEqual(["aqua", "sodium sulfate", "ci 12490", "benzyl alcohol"]);
  });
});

describe("splitRunTogether", () => {
  const dictionary = new Set(["caprylyl glycol", "isohexadecane", "camellia sinensis leaf extract", "arnica montana flower extract", "citric acid", "glycol"]);

  it("splits a token that is two ingredients with the comma missing", () => {
    expect(splitRunTogether("caprylyl glycol isohexadecane", dictionary)).toEqual(["caprylyl glycol", "isohexadecane"]);
    expect(splitRunTogether("camellia sinensis leaf extract arnica montana flower extract", dictionary)).toEqual([
      "camellia sinensis leaf extract",
      "arnica montana flower extract",
    ]);
  });

  it("takes the longest known name first", () => {
    expect(splitRunTogether("citric acid glycol", dictionary)).toEqual(["citric acid", "glycol"]);
  });

  it("returns the token whole when any word is left over", () => {
    expect(splitRunTogether("caprylyl glycol mystery", dictionary)).toEqual(["caprylyl glycol mystery"]);
  });

  it("returns a single known name whole", () => {
    expect(splitRunTogether("isohexadecane", dictionary)).toEqual(["isohexadecane"]);
  });
});

describe("fuzzyKnownName", () => {
  const dictionary = new Set([
    "helianthus annuus seed oil",
    "potassium cetyl phosphate",
    "polyquaternium-10 hydroxyethylcellulose",
    "methylparaben",
  ]);
  const attempts = () => ({ remaining: 100 });

  it("corrects a one-letter typo in a long name", () => {
    expect(fuzzyKnownName("helianthus annus seed oil", dictionary, attempts())).toBe("helianthus annuus seed oil");
    expect(fuzzyKnownName("potassium cetyl phospate", dictionary, attempts())).toBe("potassium cetyl phosphate");
  });

  it("refuses a short name, however close", () => {
    expect(fuzzyKnownName("ethylparaben", dictionary, attempts())).toBe("ethylparaben");
  });

  it("refuses a name whose digits differ", () => {
    expect(fuzzyKnownName("polyquaternium-11 hydroxyethylcellulose", dictionary, attempts())).toBe(
      "polyquaternium-11 hydroxyethylcellulose"
    );
  });

  it("stops once the attempt budget is spent", () => {
    expect(fuzzyKnownName("helianthus annus seed oil", dictionary, { remaining: 0 })).toBe("helianthus annus seed oil");
  });
});

describe("parseIngredientBlock: separators and packaging text", () => {
  it("splits a list separated by full stops", () => {
    expect(
      parseIngredientBlock("Benzoic Acid. Caprylyl Glycol. Glyceryl Behenate. Glycerin").map((p) => p.inci_name)
    ).toEqual(["benzoic acid", "caprylyl glycol", "glyceryl behenate", "glycerin"]);
  });

  it("leaves a full stop inside brackets alone", () => {
    expect(
      parseIngredientBlock("Aqua, Tocopheryl Acetate (Vit. E), Glycerin").map((p) => p.inci_name)
    ).toEqual(["aqua", "tocopheryl acetate", "glycerin"]);
  });

  it.each([
    "pet 1+ ldpe 4+ alu 41&lt",
    "code 4006381333931",
    "made in <china>",
    "www.maxbrands.n produced for maxbrands marketing ltd",
    "contact@brand.com",
    "ingrédients issus de l'agriculture biologique",
  ])(
    "rejects packaging text: %s",
    (name: string) => {
      expect(isPlausibleIngredientName(name)).toBe(false);
    }
  );

  it("splits a run-together list and corrects a typo through the whole parser", () => {
    const dictionary = new Set(["aqua", "caprylyl glycol", "isohexadecane", "helianthus annuus seed oil", "glycerin"]);
    const parsed = parseIngredientBlock(
      "Aqua, Caprylyl Glycol Isohexadecane, Helianthus Annus Seed Oil, Glycerin",
      dictionary
    );
    expect(parsed.map((p) => p.inci_name)).toEqual([
      "aqua",
      "caprylyl glycol",
      "isohexadecane",
      "helianthus annuus seed oil",
      "glycerin",
    ]);
  });
});

describe("findListByDictionary", () => {
  const dictionary = new Set(["aqua", "glycerin", "sodium chloride", "panthenol", "niacinamide"]);

  it.each([
    ["Sestavine: Aqua, Glycerin, Panthenol, Niacinamide"],
    ["Sastojci: Aqua, Glycerin, Panthenol, Niacinamide"],
    ["Ingrediente: Aqua, Glycerin, Panthenol, Niacinamide"],
    ["Ingredienser: Aqua, Glycerin, Panthenol, Niacinamide"],
  ])("finds the list under a heading nobody wrote a pattern for: %s", (text: string) => {
    expect(findListByDictionary(text, dictionary)?.trim()).toBe(
      "Aqua, Glycerin, Panthenol, Niacinamide"
    );
  });

  it("skips a run of stacked headings to the list", () => {
    const found = findListByDictionary(
      "/Sestavine:/Sastojci:/Ingrediente: Aqua, Glycerin, Panthenol",
      dictionary
    );
    expect(found?.trim()).toBe("Aqua, Glycerin, Panthenol");
  });

  it("keeps everything after the list, so a colon inside it cannot cut it short", () => {
    const found = findListByDictionary(
      "Ingredienser: Aqua, Glycerin, Panthenol, Parfum (Fragrance: Linalool, Limonene)",
      dictionary
    );
    expect(found).toContain("Limonene");
  });

  it("does not treat the colon in a colour-index name as a heading", () => {
    expect(findListByDictionary("Aqua, Glycerin, Panthenol, ci 77268:1", dictionary)).toBeNull();
  });

  it("does not skip the start of a list that a stray colon has cut short", () => {
    const stray = "Ingredients: Aqua, Glycerin, Cocam:dopropyl Betaine, Panthenol, Niacinamide";
    expect(findListByDictionary(stray, dictionary)).toBeNull();
    const parsed = parseIngredientBlock(stray, dictionary);
    expect(parsed.slice(0, 2).map((p) => p.inci_name)).toEqual(["aqua", "glycerin"]);
  });

  it("returns null when nothing recognisable follows a colon", () => {
    expect(findListByDictionary("Produkt: something, else, entirely", dictionary)).toBeNull();
  });

  it("returns null when the list already opens the text", () => {
    expect(findListByDictionary("Aqua, Glycerin, Panthenol. Note: see box", dictionary)).toBeNull();
  });

  it("matches through an alias", () => {
    const aliases = new Map([["glycérine", "glycerin"]]);
    const found = findListByDictionary("Composant: Aqua, Glycérine, Panthenol", new Set(["aqua", "panthenol"]), aliases);
    expect(found?.trim()).toBe("Aqua, Glycérine, Panthenol");
  });
});

describe("normalise", () => {
  it("lowercases and trims", () => {
    expect(normalise("  Sodium Hyaluronate ")).toBe("sodium hyaluronate");
  });

  /** Labels qualify botanicals in brackets; the dictionary is keyed without. */
  it("drops bracketed qualifiers", () => {
    expect(normalise("Butyrospermum Parkii (Shea) Butter")).toBe("butyrospermum parkii butter");
  });

  it("drops organic asterisks and stray brackets", () => {
    expect(normalise("Aloe Barbadensis Leaf Juice*")).toBe("aloe barbadensis leaf juice");
  });

  it("drops trailing percentages", () => {
    expect(normalise("Niacinamide 5%")).toBe("niacinamide");
    expect(normalise("Ascorbic Acid 12.5 %")).toBe("ascorbic acid");
  });

  it("collapses runs of whitespace from wrapped label text", () => {
    expect(normalise("Cocamidopropyl\n   Betaine")).toBe("cocamidopropyl betaine");
  });
});

describe("parseIngredientBlock", () => {
  it("splits on commas and preserves order", () => {
    const parsed = parseIngredientBlock("Water, Glycerin, Niacinamide");
    expect(parsed).toEqual([
      { inci_name: "water", position: 0 },
      { inci_name: "glycerin", position: 1 },
      { inci_name: "niacinamide", position: 2 },
    ]);
  });

  /**
   * Position is regulated information — descending concentration — and the
   * verdict engine weights by it, so order is not cosmetic.
   */
  it("keeps position stable when decoration is stripped", () => {
    const parsed = parseIngredientBlock("Aqua, Butylene Glycol (Humectant), Parfum*");
    expect(parsed.map((p) => p.inci_name)).toEqual(["aqua", "butylene glycol", "parfum"]);
    expect(parsed[2].position).toBe(2);
  });

  it("starts at the Ingredients heading, ignoring marketing above it", () => {
    const parsed = parseIngredientBlock(
      "GENTLE FOAMING CLEANSER. For all skin types. Ingredients: Water, Glycerin, Panthenol"
    );
    expect(parsed.map((p) => p.inci_name)).toEqual(["water", "glycerin", "panthenol"]);
  });

  it("recognises a Korean ingredients heading", () => {
    const parsed = parseIngredientBlock("수분 크림 전성분: Water, Glycerin, Niacinamide");
    expect(parsed.map((p) => p.inci_name)).toEqual(["water", "glycerin", "niacinamide"]);
  });

  // #185: a Hangul or kana/kanji name used to become an empty string (the
  // trailing/leading strip in `normalise` and the `/[a-z]/` filter both
  // discarded anything with no Latin letters) and vanish before it ever
  // reached the synonym lookup — this is a parser assertion, and needs no
  // dictionary data to be meaningful (done-when 1).
  it("keeps a Hangul-only name instead of discarding it", () => {
    const parsed = parseIngredientBlock("정제수, Glycerin, Niacinamide");
    expect(parsed.map((p) => p.inci_name)).toEqual(["정제수", "glycerin", "niacinamide"]);
  });

  it("keeps a kana/kanji-only name instead of discarding it", () => {
    // A single-character name ("水", water) is separately dropped by the
    // `n.length > 1` filter a few lines below in `parseIngredientBlock` —
    // real, but out of #185's blast radius (it isn't a Latin-only check and
    // affects a one-character Latin name identically), so this uses
    // realistic multi-character names instead of chasing that too.
    const parsed = parseIngredientBlock("香料, グリセリン, Niacinamide");
    expect(parsed.map((p) => p.inci_name)).toEqual(["香料", "グリセリン", "niacinamide"]);
  });

  // Found in review on #247: #185 is scoped to Korean and Japanese, but an
  // earlier version of this fix widened the filter to `\p{L}` — any Unicode
  // letter script at all, not just Hangul/kana/Han. That kept a script
  // `gateRatio` doesn't know to exempt (Cyrillic, Arabic, Greek, Hebrew,
  // Thai, ...), so an unresolved name in one of those now dragged the 60%
  // gate down where the old `[a-z]`-only filter would have discarded it
  // before it ever reached `parsed` — a regression on exactly the labels
  // this ticket isn't about. Narrowed back to Latin + the four CJK scripts,
  // so anything else is still discarded exactly as it was before this PR.
  it("still discards a non-CJK, non-Latin name (out of #185's scope)", () => {
    const parsed = parseIngredientBlock("Кириллица, Water, Glycerin");
    expect(parsed.map((p) => p.inci_name)).toEqual(["water", "glycerin"]);
  });

  // Done-when 7's fallback branch: staging's `ingredient_synonyms` cannot be
  // checked from this session (no `.env.staging` / staging credentials are
  // available here), so per the ticket's own instruction this asserts
  // resolution against an injected test dictionary instead of live data —
  // the live Korean path is unproven until #201 imports real Korean
  // synonyms. Say so plainly rather than treating this test as equivalent.
  it("a Korean-only label resolves end to end against an injected dictionary (live path unproven — see #201)", () => {
    const dictionaryWithKorean = new Set(["aqua", "glycerin", "niacinamide"]);
    const koreanAliases = new Map([
      ["정제수", "aqua"],
      ["글리세린", "glycerin"],
      ["나이아신아마이드", "niacinamide"],
    ]);
    const parsed = parseIngredientBlock("정제수, 글리세린, 나이아신아마이드", dictionaryWithKorean, koreanAliases);
    expect(parsed.map((p) => p.inci_name)).toEqual(["aqua", "glycerin", "niacinamide"]);
  });

  it.each([
    ["ingrédients: aqua, glycerin", ["aqua", "glycerin"]],
    ["INGRÉDIENTS : Aqua, Glycerin", ["aqua", "glycerin"]],
    ["ingrediente: aqua, glycerin", ["aqua", "glycerin"]],
    ["Ingredientes: Aqua, Glycerin", ["aqua", "glycerin"]],
    ["ingredienti: aqua, glycerin", ["aqua", "glycerin"]],
    ["sastojci: aqua, glycerin", ["aqua", "glycerin"]],
    ["composition : olea europea fruit oil, glycerin", ["olea europea fruit oil", "glycerin"]],
    ["Zutaten: Aqua, Glycerin", ["aqua", "glycerin"]],
  ])("recognises a non-English ingredients heading: %s", (text: string, expected: string[]) => {
    expect(parseIngredientBlock(text).map((p) => p.inci_name)).toEqual(expected);
  });

  it.each([
    ["Aqua, tocopherol. may contain : ci 77891", ["aqua", "tocopherol", "ci 77891"]],
    ["Aqua, tocopherol. peut contenir : ci 77891", ["aqua", "tocopherol", "ci 77891"]],
    ["octocrylene inactive ingredients: water, glycerin", ["octocrylene", "water", "glycerin"]],
    ["octocrylene peut contenir: water, glycerin", ["octocrylene", "water", "glycerin"]],
    ["octocrylene peuvent contenir: water, glycerin", ["octocrylene", "water", "glycerin"]],
    ["octocrylene puede contener: water, glycerin", ["octocrylene", "water", "glycerin"]],
    ["octocrylene kann enthalten: water, glycerin", ["octocrylene", "water", "glycerin"]],
    [
      "Active ingredients: Octocrylene. Inactive ingredients: Water, Glycerin",
      ["octocrylene", "water", "glycerin"],
    ],
  ])("keeps a secondary list as part of the formula: %s", (text: string, expected: string[]) => {
    expect(parseIngredientBlock(text).map((p) => p.inci_name)).toEqual(expected);
  });

  it("stops at storage instructions rather than folding them into the last name", () => {
    expect(
      parseIngredientBlock("Aqua, glyceryl caprylate. storage: store in a cool & dry place").map(
        (p) => p.inci_name
      )
    ).toEqual(["aqua", "glyceryl caprylate"]);
  });

  it("leaves a colour-index name with a trailing :N alone", () => {
    expect(parseIngredientBlock("Aqua, glycerin, ci 77268:1").map((p) => p.inci_name)).toEqual([
      "aqua",
      "glycerin",
      "ci 77268:1",
    ]);
  });

  it("stops at the next section rather than swallowing directions", () => {
    const parsed = parseIngredientBlock(
      "Ingredients: Water, Glycerin, Panthenol. Directions: Apply morning and evening, avoid the eye area"
    );
    expect(parsed.map((p) => p.inci_name)).toEqual(["water", "glycerin", "panthenol"]);
  });

  it("handles semicolon and bullet separated lists", () => {
    expect(parseIngredientBlock("Water; Glycerin • Squalane").map((p) => p.inci_name)).toEqual([
      "water",
      "glycerin",
      "squalane",
    ]);
  });

  it("drops fragments too short or numeric to be an ingredient", () => {
    const parsed = parseIngredientBlock("Water, x, 12345, Glycerin");
    expect(parsed.map((p) => p.inci_name)).toEqual(["water", "glycerin"]);
  });

  /**
   * The real failure mode. This is genuine text from Open Beauty Facts for
   * COSRX Low pH Good Morning Gel Cleanser — two ingredients fused and
   * fragments dropped, mangled upstream before we ever see it. The parser must
   * not crash or silently drop the list; the garbage survives as entries that
   * the dictionary will fail to match, and the UI marks unrecognised.
   */
  it("survives an OCR-mangled source list without losing the good entries", () => {
    const parsed = parseIngredientBlock(
      "Water, Cocamidopropyl Betaine, Sodium Lauroyl nicus Branch/Fruit/Leaf Extract, " +
        "Butylene Glycol, Styrax Japo - Ferment, Ulmus Davidiana Root raria Lobata Root"
    );
    const names = parsed.map((p) => p.inci_name);
    expect(names).toContain("water");
    expect(names).toContain("cocamidopropyl betaine");
    expect(names).toContain("butylene glycol");
    // The mangled ones are kept in place rather than guessed at or dropped.
    expect(names).toContain("styrax japo - ferment");
    expect(parsed).toHaveLength(6);
  });

  it("returns nothing for text with no ingredient list at all", () => {
    expect(parseIngredientBlock("Directions: apply twice daily")).toEqual([]);
  });

  /**
   * The most common bad name in the catalogue: "1,2-Hexanediol" was split on
   * its own locant comma into a bare "1" (dropped) and an orphaned
   * "2-hexanediol" that matches no dictionary entry, across 25 products.
   */
  it("keeps a locant comma inside a chemical name", () => {
    const parsed = parseIngredientBlock(
      "Ingredients: Water, 1,2-Hexanediol, Butylene Glycol, 1,3-Butylene Glycol"
    );
    expect(parsed.map((p) => p.inci_name)).toEqual([
      "water",
      "1,2-hexanediol",
      "butylene glycol",
      "1,3-butylene glycol",
    ]);
  });

  it("still splits a separator comma that precedes a number-led name", () => {
    const parsed = parseIngredientBlock("Ingredients: Water, Glycerin, 4-Terpineol");
    expect(parsed.map((p) => p.inci_name)).toEqual(["water", "glycerin", "4-terpineol"]);
  });

  /**
   * The case the test above doesn't actually cover: a comma with NO space
   * before a digit-led name. `,(?!\d)` alone can't tell that apart from a
   * locant comma like "1,2-Hexanediol" — both have a digit immediately after
   * the comma — so a lookahead-only check fused "Water,4-Terpineol" into one
   * unmatchable token. The fix also has to check what's before the comma: a
   * locant sits between two digits, a real separator doesn't.
   */
  it("splits a separator comma with no space before a number-led name, while still protecting a locant comma", () => {
    const parsed = parseIngredientBlock(
      "Ingredients: Water,4-Terpineol, Glycerin, 1,2-Hexanediol"
    );
    expect(parsed.map((p) => p.inci_name)).toEqual([
      "water",
      "4-terpineol",
      "glycerin",
      "1,2-hexanediol",
    ]);
  });

  /**
   * Real trailing OCR text from the same La Roche-Posay label used elsewhere
   * in this file: after the formula, the net-quantity mark and distributor
   * boilerplate follow directly with no "Directions"-style heading of their
   * own, and would otherwise degrade to junk fragments that dilute the
   * recognised-ingredient ratio enough to sink the verdict.
   */
  it("stops before the net-quantity mark and distributor text", () => {
    const parsed = parseIngredientBlock(
      "Ingredients: Water, Glycerin, Niacinamide. e 400 ml Distribution réservée aux dépositaires agréés"
    );
    expect(parsed.map((p) => p.inci_name)).toEqual(["water", "glycerin", "niacinamide"]);
  });
});

describe("reconstructFromDictionary", () => {
  it("greedily matches the longest known multi-word ingredient at each position", () => {
    const dictionary = new Set(["water", "butylene glycol", "niacinamide", "panthenol"]);
    const parsed = reconstructFromDictionary(
      ["Water", "Butylene", "Glycol", "Niacinamide", "Panthenol"],
      dictionary
    );
    expect(parsed.map((p) => p.inci_name)).toEqual([
      "water",
      "butylene glycol",
      "niacinamide",
      "panthenol",
    ]);
  });

  /**
   * OCR read "PARKI" for the label's "PARKII". The typo sits inside a
   * multi-word name, so single-word fuzzy matching can't save it — the whole
   * window has to be matched approximately.
   */
  it("tolerates an OCR typo inside a multi-word name", () => {
    const dictionary = new Set(["butyrospermum parkii butter", "glycerin"]);
    const parsed = reconstructFromDictionary(
      ["Butyrospermum", "Parki", "Butter", "Glycerin"],
      dictionary
    );
    expect(parsed.map((p) => p.inci_name)).toEqual([
      "butyrospermum parkii butter",
      "glycerin",
    ]);
  });

  /**
   * A short fragment is within one edit of half the dictionary, so fuzzy
   * matching it invents ingredients. "fll" (from a batch code) must stay
   * unrecognised rather than resolve to some real name.
   */
  /**
   * Two dictionary names sit one edit from the OCR text. Nothing in the text
   * says which was printed, so picking either would invent an ingredient the
   * product may not contain — the risk grows with every name added.
   */
  it("refuses an ambiguous fuzzy match rather than breaking the tie", () => {
    const dictionary = new Set(["ceramide np", "ceramide ap", "glycerin"]);
    const parsed = reconstructFromDictionary(["Ceramide", "Xp", "Glycerin"], dictionary);
    const names = parsed.map((p) => p.inci_name);
    expect(names).not.toContain("ceramide np");
    expect(names).not.toContain("ceramide ap");
    expect(names).toContain("glycerin");
  });

  it("still resolves a fuzzy match when only one candidate is closest", () => {
    const dictionary = new Set(["ceramide np", "glycerin"]);
    const parsed = reconstructFromDictionary(["Ceramide", "Xp", "Glycerin"], dictionary);
    expect(parsed.map((p) => p.inci_name)).toContain("ceramide np");
  });

  it("refuses to fuzzy-match a fragment too short to be distinctive", () => {
    const dictionary = new Set(["fill", "oils", "glycerin"]);
    const parsed = reconstructFromDictionary(["Fll", "Glycerin"], dictionary);
    expect(parsed.map((p) => p.inci_name)).toEqual(["fll", "glycerin"]);
  });

  describe("slash-separated dual names", () => {
    it("resolves a dual name to its canonical first half", () => {
      const dictionary = new Set(["aqua", "water", "glycerin"]);
      const parsed = reconstructFromDictionary(["Aqua/Water", "Glycerin"], dictionary);
      expect(parsed.map((p) => p.inci_name)).toEqual(["aqua", "glycerin"]);
    });

    it("accepts a single unknown word after the slash", () => {
      // "Brassica Campestris (Rapeseed) Seed Oil" prints as
      // "BRASSICA CAMPESTRIS SEED OIL/RAPESEED"; "rapeseed" is not itself an
      // INCI name, but one trailing word is a common-name annotation.
      const dictionary = new Set(["brassica campestris seed oil", "propanediol"]);
      const parsed = reconstructFromDictionary(
        ["Brassica", "Campestris", "Seed", "Oil/Rapeseed", "Propanediol"],
        dictionary
      );
      expect(parsed.map((p) => p.inci_name)).toEqual([
        "brassica campestris seed oil",
        "propanediol",
      ]);
    });

    it("does not let the trailing annotation match approximately", () => {
      // Regression: "…butter/shea butter glycerin" was accepted as one
      // ingredient because the trailing part was allowed a fuzzy match,
      // swallowing the glycerin that came after it.
      const dictionary = new Set([
        "butyrospermum parkii butter",
        "shea butter",
        "glycerin",
      ]);
      const parsed = reconstructFromDictionary(
        ["Butyrospermum", "Parki", "Butter/Shea", "Butter", "Glycerin"],
        dictionary
      );
      expect(parsed.map((p) => p.inci_name)).toEqual([
        "butyrospermum parkii butter",
        "glycerin",
      ]);
    });

    it("does not swallow the ingredients that follow a slash", () => {
      // The words after the slash here are a different ingredient, not a
      // common-name annotation — the window must be rejected.
      const dictionary = new Set([
        "brassica campestris seed oil",
        "ammonium polyacryloyldimethyl taurate",
      ]);
      const parsed = reconstructFromDictionary(
        ["Brassica", "Campestris", "Seed", "Oil/Rapeseed", "Ammonium", "Polyacryloyldimethyl", "Taurate"],
        dictionary
      );
      expect(parsed.map((p) => p.inci_name)).toEqual([
        "brassica campestris seed oil",
        "ammonium polyacryloyldimethyl taurate",
      ]);
    });
  });
});

describe("parseIngredientBlock with a dictionary", () => {
  /**
   * Real OCR text from a La Roche-Posay label: the printed bullet
   * separators between ingredients were not detected as characters at all —
   * confirmed against the live Vision API response, not just misread — so
   * the plain delimiter split has nothing to split on and collapses the
   * whole list into one over-length token. "PARKI" (missing the second "i")
   * is also genuine OCR output, not a typo introduced for this test.
   */
  it("falls back to dictionary reconstruction when OCR drops all delimiters", () => {
    // Dictionary entries are the real canonical INCI names, as held in the
    // `ingredients` table. The expected output is the first five names of the
    // barcode-sourced list for this same product (obf-3337875696548) — the two
    // paths should agree.
    const dictionary = new Set([
      "aqua",
      "water",
      "butyrospermum parkii butter",
      "shea butter",
      "glycerin",
      "dimethicone",
      "niacinamide",
    ]);
    const parsed = parseIngredientBlock(
      "INGREDIENTS: AQUA/WATER BUTYROSPERMUM PARKI BUTTER/SHEA BUTTER GLYCERIN DIMETHICONE NIACINAMIDE",
      dictionary
    );
    expect(parsed.map((p) => p.inci_name)).toEqual([
      "aqua",
      "butyrospermum parkii butter",
      "glycerin",
      "dimethicone",
      "niacinamide",
    ]);
  });

  /**
   * `product_ingredients` is keyed on (product_id, position), not inci_name,
   * so nothing stops two rows landing on the same name — and two different
   * unmatched multi-word ingredients can both degrade to the same bare
   * leftover word ("Argania Spinosa Kernel Oil" and "Prunus Amygdalus Dulcis
   * Oil" both landing on "oil"). The client keys ingredient rows by name, so
   * a real duplicate here becomes a React key collision.
   */
  it("drops a duplicate ingredient name rather than emitting it twice", () => {
    const dictionary = new Set([
      "argania",
      "spinosa",
      "kernel",
      "prunus",
      "amygdalus",
      "dulcis",
    ]);
    const parsed = parseIngredientBlock(
      "Ingredients: Argania Spinosa Kernel Oil Prunus Amygdalus Dulcis Oil",
      dictionary
    );
    const names = parsed.map((p) => p.inci_name);
    expect(names.filter((n) => n === "oil")).toHaveLength(1);
    expect(names).toEqual([
      "argania",
      "spinosa",
      "kernel",
      "oil",
      "prunus",
      "amygdalus",
      "dulcis",
    ]);
    // Positions stay a contiguous 0..n-1 run with no gap left by the drop.
    expect(parsed.map((p) => p.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  /**
   * The French names came off a bilingual label as an ordinary
   * comma-separated list, so aliases have to resolve on the delimited path —
   * not only inside dictionary reconstruction.
   */
  it("resolves a synonym to its canonical name in a delimited list", () => {
    const aliases = new Map([
      ["glycérine", "glycerin"],
      ["mineral oil", "paraffinum liquidum"],
      ["acide citrique", "citric acid"],
    ]);
    const parsed = parseIngredientBlock(
      "Ingredients: Aqua, Glycérine, Mineral Oil, Acide Citrique",
      undefined,
      aliases
    );
    expect(parsed.map((p) => p.inci_name)).toEqual([
      "aqua",
      "glycerin",
      "paraffinum liquidum",
      "citric acid",
    ]);
  });

  it("collapses a synonym and its canonical name to one entry", () => {
    // "Aqua/Water" style labels can name the same substance twice; after
    // resolution both become `glycerin` and the duplicate must not survive.
    const aliases = new Map([["glycérine", "glycerin"]]);
    const parsed = parseIngredientBlock(
      "Ingredients: Glycerin, Glycérine, Panthenol, Niacinamide",
      undefined,
      aliases
    );
    expect(parsed.map((p) => p.inci_name)).toEqual(["glycerin", "panthenol", "niacinamide"]);
  });

  it("finds the list under a heading in a language nobody wrote a pattern for", () => {
    const dictionary = new Set(["aqua", "glycerin", "panthenol", "niacinamide"]);
    const parsed = parseIngredientBlock("Ingredienser: Aqua, Glycerin, Panthenol, Niacinamide", dictionary);
    expect(parsed.map((p) => p.inci_name)).toEqual(["aqua", "glycerin", "panthenol", "niacinamide"]);
  });

  it("drops a fragment that is not a name even when it is delimited like one", () => {
    const parsed = parseIngredientBlock("Aqua, Glycerin, package labeling: label.jpg, Panthenol");
    expect(parsed.map((p) => p.inci_name)).toEqual(["aqua", "glycerin", "panthenol"]);
  });

  it("ignores the dictionary when the plain delimiter split already looks trustworthy", () => {
    const parsed = parseIngredientBlock(
      "Water, Glycerin, Niacinamide, Panthenol",
      new Set(["something else entirely"])
    );
    expect(parsed.map((p) => p.inci_name)).toEqual([
      "water",
      "glycerin",
      "niacinamide",
      "panthenol",
    ]);
  });
});
