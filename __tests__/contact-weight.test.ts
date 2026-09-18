import { PRODUCT_TYPE_LABEL, type ProductType } from "@/data/types";
import { contactWeight } from "@/lib/rules";

/**
 * Product use changes positive evidence and potential harm independently.
 * Ambiguous use fails safe in both directions: full harm exposure, but only
 * conservative benefit credit.
 */

const ALL_TYPES = Object.keys(PRODUCT_TYPE_LABEL) as ProductType[];

describe("contactWeight", () => {
  it("gives every ProductType valid weights and never credits more benefit than harm", () => {
    for (const type of ALL_TYPES) {
      const contact = contactWeight(type);
      expect(contact.harm).toBeGreaterThan(0);
      expect(contact.harm).toBeLessThanOrEqual(1);
      expect(contact.benefit).toBeGreaterThan(0);
      expect(contact.benefit).toBeLessThanOrEqual(contact.harm);
    }
  });

  it.each(["cleanser", "body-wash"] as ProductType[])(
    "gives the unambiguous quick rinse-off %s equal low weights",
    (type: ProductType) => {
      expect(contactWeight(type)).toEqual({ harm: 0.25, benefit: 0.25 });
    }
  );

  it("gives an unambiguous short-contact body scrub equal middle weights", () => {
    expect(contactWeight("body-scrub")).toEqual({ harm: 0.5, benefit: 0.5 });
  });

  it.each(["serum", "moisturizer", "sunscreen", "night-mask", "lip-balm"] as ProductType[])(
    "gives the known leave-on %s full weight in both directions",
    (type: ProductType) => {
      expect(contactWeight(type)).toEqual({ harm: 1, benefit: 1 });
    }
  );

  it.each([
    ["exfoliator", 0.5],
    ["conditioner", 0.5],
    ["hair-mask", 0.5],
    ["shampoo", 0.5],
    ["face-mask", 0.5],
  ] as [ProductType, number][])(
    "keeps ambiguous %s harm at full weight and discounts only its benefit",
    (type: ProductType, benefit: number) => {
      // A physical scrub and a leave-on acid liquid, a rinse-out and a
      // leave-in conditioner, a hair mask rinsed after twenty minutes and one
      // left in overnight, a rinse-out shampoo and a dry shampoo sprayed in
      // and left, a clay mask rinsed after minutes and a cream mask that
      // often isn't — nothing separates them, so each gets the same
      // ambiguous-use policy (issue #105 for face-mask).
      expect(contactWeight(type)).toEqual({ harm: 1, benefit });
    }
  );

  it("scores eye-patch and pimple-patch the same as each other and as sheet-mask", () => {
    // Not ambiguous like face-mask above — a patch is worn, then peeled off,
    // never rinsed. Kept as separate types for browsing/labeling, but scored
    // identically on purpose (issue #105).
    expect(contactWeight("eye-patch")).toEqual(contactWeight("pimple-patch"));
    expect(contactWeight("eye-patch")).toEqual(contactWeight("sheet-mask"));
  });

  it("treats an unknown type as full harm but conservative benefit", () => {
    expect(contactWeight("unknown")).toEqual({ harm: 1, benefit: 0.25 });
  });

  // `products.type` is unconstrained text in the database, so an unexpected
  // server value must receive the same fail-safe policy as `unknown`.
  it("uses the unknown policy for a type not present in the table", () => {
    expect(contactWeight("a-type-nobody-has-heard-of" as ProductType)).toEqual({
      harm: 1,
      benefit: 0.25,
    });
  });

  // A plain object inherits these names. The own-property guard must prevent
  // a prototype function from escaping as a supposed contact-weight object.
  it.each([
    "constructor",
    "toString",
    "__proto__",
    "hasOwnProperty",
    "valueOf",
  ] as unknown as ProductType[])(
    "uses the unknown policy for inherited property name %s",
    (type: ProductType) => {
      expect(contactWeight(type)).toEqual({ harm: 1, benefit: 0.25 });
    }
  );
});
