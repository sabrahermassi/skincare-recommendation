import type { ProductType } from "@/data/types";
import { visibleTypeChips } from "@/lib/browse-chips";

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
