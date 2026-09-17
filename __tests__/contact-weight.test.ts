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
    for (const type of ["cleanser", "body-wash", "shampoo"] as ProductType[]) {
      expect(contactWeight(type)).toBe(0.25);
    }
  });

  it("scores what sits for minutes between the two", () => {
    for (const type of ["conditioner", "body-scrub", "hair-mask"] as ProductType[]) {
      expect(contactWeight(type)).toBe(0.5);
    }
  });

  it("scores leave-on products at full weight", () => {
    for (const type of ["serum", "moisturizer", "sunscreen", "night-mask", "lip-balm"] as ProductType[]) {
      expect(contactWeight(type)).toBe(1);
    }
  });

  it("orders the three bands, rather than only pinning their values", () => {
    expect(contactWeight("cleanser")).toBeLessThan(contactWeight("hair-mask"));
    expect(contactWeight("hair-mask")).toBeLessThan(contactWeight("serum"));
  });

  /**
   * The invariant behind the table, not a sample of it: only the six types
   * that genuinely wash away may be discounted. Without this, a later edit
   * could quietly drop a leave-on type below full weight — which is the
   * direction that under-counts an irritant, and the one failure this whole
   * weighting is arranged to avoid.
   */
  it("discounts only the types that are genuinely washed off", () => {
    const discounted = new Set<ProductType>([
      "cleanser",
      "body-wash",
      "shampoo",
      "conditioner",
      "body-scrub",
      "hair-mask",
    ]);
    for (const type of ALL_TYPES) {
      if (discounted.has(type)) expect(contactWeight(type)).toBeLessThan(1);
      else expect(contactWeight(type)).toBe(1);
    }
  });

  it("gives an exfoliator full weight, because the type spans both exposures", () => {
    // A physical scrub and a leave-on acid liquid both land on this type and
    // no tag separates them, so it follows the same rule as `unknown`.
    expect(contactWeight("exfoliator")).toBe(1);
  });

  it("scores an unknown type as full leave-on exposure, not a discount", () => {
    // Failing safe: a product we could not classify must not have its
    // irritants quietly counted at a fraction of their weight.
    expect(contactWeight("unknown")).toBe(1);
  });
});
