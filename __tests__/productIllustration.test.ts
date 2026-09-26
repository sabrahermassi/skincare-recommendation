import { PRODUCT_TYPE_LABEL, type ProductType } from "@/data/types";
import { productIllustrationSource } from "@/lib/productIllustration";
import { defaultPackagingType } from "@/data/packaging";

/**
 * Every `ProductType` (all 30, including the 16 added alongside the
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

  it("gives every known type its own icon, not the unknown fallback", () => {
    // Without this, a type missing from CONTAINER_BY_TYPE would resolve to the
    // plain unlabeled `unknown` bottle and still satisfy the "is defined"
    // check above — the icon would silently be wrong rather than absent.
    //
    // "micellar-water" is deliberately exempt alongside "unknown" itself: it
    // was split out of "cleanser" (step 13, PR #130) with no labeled icon of
    // its own drawn yet, so it falls back to the same untexted pump bottle on
    // purpose — a "Cleanser"-labeled icon would misdescribe it, which is a
    // worse failure than an unlabeled one.
    const fallback = productIllustrationSource({ id: "x", type: "unknown" });
    for (const type of ALL_TYPES.filter((t) => t !== "unknown" && t !== "micellar-water")) {
      expect(productIllustrationSource({ id: "x", type })).not.toBe(fallback);
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
