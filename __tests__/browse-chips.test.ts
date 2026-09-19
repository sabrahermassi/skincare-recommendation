import type { ProductType } from "@/data/types";
import { activeTypeFilter, visibleTypeChips } from "@/lib/browse-chips";

const of = (...types: ProductType[]) => types.map((type) => ({ type }));

describe("visibleTypeChips", () => {
  it("orders the leading types as the launch catalogue counts them", () => {
    expect(visibleTypeChips(of("essence", "cleanser", "sunscreen", "serum", "moisturizer"))).toEqual([
      "sunscreen",
      "moisturizer",
      "cleanser",
      "serum",
      "essence",
    ]);
  });

  it("hides a type with no products", () => {
    expect(visibleTypeChips(of("sunscreen", "sunscreen"))).toEqual(["sunscreen"]);
    expect(visibleTypeChips([])).toEqual([]);
  });

  it("shows a previously empty type as soon as a product of it exists", () => {
    expect(visibleTypeChips(of("sunscreen"))).not.toContain("shampoo");
    expect(visibleTypeChips(of("sunscreen", "shampoo"))).toContain("shampoo");
  });

  it("puts types outside the leading list after it", () => {
    expect(visibleTypeChips(of("shampoo", "eye-cream", "essence", "sunscreen"))).toEqual([
      "sunscreen",
      "essence",
      "eye-cream",
      "shampoo",
    ]);
  });

  it("never shows a chip for unknown", () => {
    expect(visibleTypeChips(of("unknown", "serum"))).toEqual(["serum"]);
  });
});

describe("activeTypeFilter", () => {
  it("keeps the selected type while the catalogue has not loaded", () => {
    expect(activeTypeFilter("serum", null)).toBe("serum");
  });

  it("keeps a selected type that still has a chip", () => {
    expect(activeTypeFilter("serum", ["sunscreen", "serum"])).toBe("serum");
  });

  it("falls back to all when the selected type has no chip any more", () => {
    expect(activeTypeFilter("serum", ["sunscreen"])).toBe("all");
    expect(activeTypeFilter("serum", [])).toBe("all");
  });

  it("leaves all alone", () => {
    expect(activeTypeFilter("all", [])).toBe("all");
  });
});
