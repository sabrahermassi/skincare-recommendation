import { PRODUCT_TYPE_LABEL, type ProductType } from "@/data/types";
import { productIllustrationSource } from "@/lib/productIllustration";
import { defaultPackagingType } from "@/components/BottleIcon";

/**
 * Every `ProductType` (all 27, including the 16 added alongside the
 * ingredient-based fallback) needs a defined icon source and a defined
 * packaging shape — a mapping missed in one of the two Records here would
 * previously only surface as a runtime crash or a silently blank image, not
 * a build failure, since neither function throws on its own for a missing
 * key. `Object.keys(PRODUCT_TYPE_LABEL)` is used as the source of every
 * `ProductType` value rather than a hand-written list, so this test can't
 * itself go stale the next time a type is added.
 */
const ALL_TYPES = Object.keys(PRODUCT_TYPE_LABEL) as ProductType[];

describe("productIllustrationSource", () => {
  it("resolves a defined icon source for every ProductType", () => {
    for (const type of ALL_TYPES) {
      const source = productIllustrationSource({ id: "x", type });
      expect(source).toBeDefined();
    }
  });

  it("prefers a real photo over the type-based icon when one is present", () => {
    const source = productIllustrationSource({ id: "x", type: "serum", imageUrl: "https://example.com/a.jpg" });
    expect(source).toEqual({ uri: "https://example.com/a.jpg" });
  });
});

describe("defaultPackagingType", () => {
  it("returns a defined packaging shape for every ProductType", () => {
    for (const type of ALL_TYPES) {
      expect(defaultPackagingType(type)).toBeDefined();
    }
  });
});
