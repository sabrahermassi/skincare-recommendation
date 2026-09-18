import { PRODUCT_TYPE_LABEL, type ProductType } from "@/data/types";
import { contactWeight } from "@/lib/rules";

/**
 * `contactWeight` is the one place a product's *type* touches its score: it
 * scales how much each ingredient counts, standing in for how long the
 * formula stays on the skin. Everything else in the score comes from the
 * formula itself.
 *
 * The rule that matters most here is the last test: an unrecognised type is
 * scored at full leave-on exposure, so a wrong guess can only ever make the
 * app over-cautious, never under-count an irritant.
 */

const ALL_TYPES = Object.keys(PRODUCT_TYPE_LABEL) as ProductType[];

describe("contactWeight", () => {
  it("gives every ProductType a weight between 0 and 1", () => {
    for (const type of ALL_TYPES) {
      const weight = contactWeight(type);
      expect(weight).toBeGreaterThan(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });

  it("scores what rinses off in a minute lowest", () => {
    for (const type of ["cleanser", "body-wash"] as ProductType[]) {
      expect(contactWeight(type)).toBe(0.25);
    }
  });

  it("scores what sits for minutes between the two", () => {
    expect(contactWeight("body-scrub")).toBe(0.5);
  });

  it("scores leave-on products at full weight", () => {
    for (const type of ["serum", "moisturizer", "sunscreen", "night-mask", "lip-balm"] as ProductType[]) {
      expect(contactWeight(type)).toBe(1);
    }
  });

  it("orders the three bands, rather than only pinning their values", () => {
    expect(contactWeight("cleanser")).toBeLessThan(contactWeight("body-scrub"));
    expect(contactWeight("body-scrub")).toBeLessThan(contactWeight("serum"));
  });

  /**
   * The invariant behind the table, not a sample of it: only the three types
   * that unambiguously wash away may be discounted. Without this, a later
   * edit could quietly drop a leave-on type below full weight — the
   * direction that under-counts an irritant, and the one failure this whole
   * weighting is arranged to avoid.
   */
  it("discounts only the types that are genuinely washed off", () => {
    const discounted = new Set<ProductType>(["cleanser", "body-wash", "body-scrub"]);
    for (const type of ALL_TYPES) {
      if (discounted.has(type)) expect(contactWeight(type)).toBeLessThan(1);
      else expect(contactWeight(type)).toBe(1);
    }
  });

  it.each(["exfoliator", "conditioner", "hair-mask", "shampoo", "face-mask"] as ProductType[])(
    "gives %s full weight, because the type spans both exposures",
    (type: ProductType) => {
      // A physical scrub and a leave-on acid liquid, a rinse-out and a
      // leave-in conditioner, a hair mask rinsed after twenty minutes and one
      // left in overnight, a rinse-out shampoo and a dry shampoo sprayed in
      // and left, a clay mask rinsed after minutes and a cream mask that
      // often isn't — nothing separates them, so each follows the same rule
      // as `unknown`.
      expect(contactWeight(type)).toBe(1);
    },
  );

  it("scores eye-patch and pimple-patch the same as each other and as sheet-mask", () => {
    // Not ambiguous like face-mask above — a patch is worn, then peeled off,
    // never rinsed. Kept as separate types for browsing/labeling, but scored
    // identically on purpose (issue #105).
    expect(contactWeight("eye-patch")).toBe(contactWeight("pimple-patch"));
    expect(contactWeight("eye-patch")).toBe(contactWeight("sheet-mask"));
  });

  // The bug this replaced: `EXPOSURE_BY_TYPE[type]` with no fallback returned
  // `undefined` for a value not in the table, which would have turned every
  // ingredient weight — and the score — into `NaN`. `products.type` is
  // unconstrained text, so this is reachable from a typo'd or newly-added
  // server-side value, not just a test's imagination.
  it("falls back to full weight for a type not in the table", () => {
    expect(contactWeight("a-type-nobody-has-heard-of" as ProductType)).toBe(1);
  });

  // The bug this replaced: `EXPOSURE_BY_TYPE` is a plain object literal, so
  // `EXPOSURE_BY_TYPE["constructor"]` resolved to `Object.prototype`'s own
  // `constructor` function rather than `undefined` — a value the `?? 1`
  // fallback above never catches, since a function is neither `null` nor
  // `undefined`. Multiplying that function into the score produced `NaN`.
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"] as unknown as ProductType[])(
    "falls back to full weight for the inherited property name %s, not Object.prototype's own member",
    (type: ProductType) => {
      expect(contactWeight(type)).toBe(1);
    },
  );

  it("still discounts an unambiguous rinse-off", () => {
    expect(contactWeight("cleanser")).toBe(0.25);
  });

  it("scores an unknown type as full leave-on exposure, not a discount", () => {
    // Failing safe: a product we could not classify must not have its
    // irritants quietly counted at a fraction of their weight.
    expect(contactWeight("unknown")).toBe(1);
  });
});
