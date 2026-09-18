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

  it.each([
    "serum",
    "moisturizer",
    "sunscreen",
    "night-mask",
    "lip-balm",
    // Split out of "cleanser" (step 13, PR #130): wiped off, not rinsed, so
    // it keeps full exposure rather than inheriting the rinse-off discount.
    "micellar-water",
  ] as ProductType[])(
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
  ] as [ProductType, number][])(
    "keeps ambiguous %s harm at full weight and discounts only its benefit",
    (type: ProductType, benefit: number) => {
      expect(contactWeight(type)).toEqual({ harm: 1, benefit });
    }
  );

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
