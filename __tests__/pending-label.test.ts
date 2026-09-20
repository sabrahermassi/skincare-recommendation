import { clearLabelRead, heldLabelRead, holdLabelRead } from "@/lib/pending-label";

describe("the label read being added", () => {
  afterEach(clearLabelRead);

  it("holds nothing until a photo has been read", () => {
    expect(heldLabelRead()).toBeNull();
  });

  it("holds the list and the barcode that came with it", () => {
    holdLabelRead({ ingredients: ["aqua", "glycerin"], barcode: "8801234567890" });

    expect(heldLabelRead()).toEqual({ ingredients: ["aqua", "glycerin"], barcode: "8801234567890" });
  });

  it("is replaced by the next read, not merged with it", () => {
    holdLabelRead({ ingredients: ["aqua"], barcode: "8801234567890" });
    holdLabelRead({ ingredients: ["glycerin"] });

    expect(heldLabelRead()).toEqual({ ingredients: ["glycerin"] });
  });

  it("is empty again once cleared", () => {
    holdLabelRead({ ingredients: ["aqua"] });
    clearLabelRead();

    expect(heldLabelRead()).toBeNull();
  });
});
