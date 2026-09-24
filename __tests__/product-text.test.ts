import { PRODUCT_TYPE_LABEL } from "@/data/types";
import {
  MAX_BRAND_CHARS,
  MAX_NAME_CHARS,
  MAX_NEW_STUBS_PER_SAVE,
  PRODUCT_TYPES,
  acceptedProductType,
  exactIlikePattern,
  mostCommonSpelling,
  productTextProblem,
  savedTextProblem,
  storedText,
  tidySpacing,
} from "@/supabase/functions/_shared/product-text";

/** label-ocr's checks on a user-added product's name, brand, type and new ingredients (#200). */
describe("productTextProblem", () => {
  it.each([
    "CeraVe Hydrating Cleanser",
    "Dr.Jart+ Cicapair Tiger Grass Cream",
    "No.7 Protect & Perfect",
    "Paula's Choice 2% BHA Liquid Exfoliant",
    "라운드랩 1025 독도 토너",
    "Beauty of Joseon Relief Sun: Rice + Probiotics SPF50+",
    "Glow Glow Serum",
  ])("accepts a real product name: %s", (name: string) => {
    expect(productTextProblem(name)).toBeNull();
  });

  it.each([
    ["Buy at https://example.test/deal", "url"],
    ["www.cheap-cosmetics.shop", "url"],
    ["best-serum.com", "url"],
    ["Cream\u0000", "control"],
    ["Toner‮evil", "control"],
    ["!!!", "punctuation"],
    ["— … —", "punctuation"],
    ["Aaaaaaaa", "repetition"],
    ["spam spam spam spam", "repetition"],
  ])("refuses %j as %s", (name: string, problem: string) => {
    expect(productTextProblem(name)).toBe(problem);
  });
});

// #266 review: the check runs before label-ocr's rate limiter.
describe("savedTextProblem", () => {
  it("only reads the part a save would store", () => {
    const filler = (length: number) =>
      Array.from({ length: 100 }, (_, i) => `Word${i}`).join(" ").slice(0, length);
    expect(savedTextProblem("name", `${filler(MAX_NAME_CHARS)} https://example.test`)).toBeNull();
    expect(savedTextProblem("brand", `${filler(MAX_BRAND_CHARS - 20)} www.x.shop`)).toBe("url");
  });

  // Round 2: tidying first, so a run of spaces can't hide text the save would keep.
  it("checks the tidied text a save stores, not the raw slice", () => {
    expect(savedTextProblem("name", `A${" ".repeat(199)}www.evil.com`)).toBe("url");
    expect(storedText("name", `A${" ".repeat(199)}www.evil.com`)).toBe("A www.evil.com");
  });

  it("stays fast on a multi-megabyte name", () => {
    const huge = "ab".repeat(2_500_000);
    const started = Date.now();
    savedTextProblem("name", huge);
    expect(Date.now() - started).toBeLessThan(250);
  });
});

describe("brand handling", () => {
  it("collapses whitespace the way a brand is stored and matched", () => {
    expect(tidySpacing("  Round   Lab \n")).toBe("Round Lab");
  });

  it("picks the spelling most of the catalogue uses, so one odd row can't set it", () => {
    expect(mostCommonSpelling(["cerave", "Cerave", "CeraVe", "Cerave", "CeraVe", "CeraVe"])).toBe("CeraVe");
    expect(mostCommonSpelling(["Cerave", "CeraVe"])).toBe(mostCommonSpelling(["CeraVe", "Cerave"]));
    expect(mostCommonSpelling([])).toBeNull();
  });

  it("escapes ILIKE wildcards so a brand only ever matches itself", () => {
    expect(exactIlikePattern("100%_pure\\")).toBe("100\\%\\_pure\\\\");
  });
});

describe("product type", () => {
  it("lists exactly the app's ProductType values", () => {
    expect([...PRODUCT_TYPES].sort()).toEqual(Object.keys(PRODUCT_TYPE_LABEL).sort());
  });

  it("keeps a real pick and falls back to unknown for anything else", () => {
    expect(acceptedProductType("toner")).toBe("toner");
    expect(acceptedProductType(undefined)).toBe("unknown");
    expect(acceptedProductType("not-a-type")).toBe("unknown");
    expect(acceptedProductType(42)).toBe("unknown");
  });
});

describe("new-ingredient cap", () => {
  // A 60-name Korean list, none of whose Hangul names resolve yet (#201).
  it("never refuses a long Korean list the coverage gate would let through", () => {
    expect(MAX_NEW_STUBS_PER_SAVE).toBeGreaterThanOrEqual(60);
  });
});
