import { onlyLimitedInPregnancy, pregnancyCautionLevel } from "@/lib/pregnancy-caution";

// #475: what each group's source says to do, so the card and the ingredient row never say "avoid" for a "limit".
describe("pregnancy caution levels", () => {
  it("limits essential oils and salicylic acid, and avoids retinoids and hydroquinone", () => {
    expect(pregnancyCautionLevel("rosmarinus officinalis leaf oil")).toBe("limit");
    expect(pregnancyCautionLevel("salicylic acid")).toBe("limit");
    expect(pregnancyCautionLevel("retinol")).toBe("avoid");
    expect(pregnancyCautionLevel("hydroquinone")).toBe("avoid");
    expect(pregnancyCautionLevel("glycerin")).toBeNull();
  });

  it("is 'limited' only when every name is a limit", () => {
    expect(onlyLimitedInPregnancy(["salicylic acid", "lavandula angustifolia oil"])).toBe(true);
    expect(onlyLimitedInPregnancy(["salicylic acid", "retinol"])).toBe(false);
    expect(onlyLimitedInPregnancy([])).toBe(false);
  });
});
