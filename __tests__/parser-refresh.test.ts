import { isParserOnlyChange } from "../supabase/functions/_shared/parser-refresh";
import { parseIngredientBlock } from "@/lib/inci";

/**
 * An expired third-party row is written again under the same id. If the label is
 * unchanged and only the parser improved, the rewrite must not stamp
 * `formula_changed_at`, which the product screen shows saved-product users as a
 * "reformulated" notice.
 */
describe("isParserOnlyChange", () => {
  const parse = (text: string) => parseIngredientBlock(text);

  it("is true when an old one-token formula now reads as the separate names", () => {
    const stored = [{ inci_name: "benzoic acid. caprylyl glycol. glycerin. aqua", position: 0 }];
    const fresh = parse("Benzoic Acid. Caprylyl Glycol. Glycerin. Aqua");
    expect(fresh).toHaveLength(4);
    expect(isParserOnlyChange(stored, fresh, parse)).toBe(true);
  });

  it("is false when the label really changed", () => {
    const stored = [{ inci_name: "benzoic acid. caprylyl glycol. glycerin. aqua", position: 0 }];
    const fresh = parse("Benzoic Acid. Caprylyl Glycol. Glycerin. Panthenol");
    expect(isParserOnlyChange(stored, fresh, parse)).toBe(false);
  });

  it("is false for a product with no stored formula", () => {
    expect(isParserOnlyChange([], parse("Aqua, Glycerin, Panthenol, Allantoin"), parse)).toBe(false);
  });

  it("is false when the formula is identical, so no flag is needed", () => {
    const fresh = parse("Aqua, Glycerin, Panthenol, Allantoin");
    expect(isParserOnlyChange(fresh, fresh, parse)).toBe(false);
  });

  it("reads the stored rows in position order, not arrival order", () => {
    const fresh = parse("Aqua. Glycerin. Panthenol. Allantoin");
    const stored = [{ inci_name: "panthenol. allantoin", position: 1 }, { inci_name: "aqua. glycerin", position: 0 }];
    expect(isParserOnlyChange(stored, fresh, parse)).toBe(true);
  });
});
