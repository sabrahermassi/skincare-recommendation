import { clearLabelRead, heldLabelRead, holdLabelRead } from "@/lib/pending-label";

describe("the label read being held", () => {
  afterEach(clearLabelRead);

  it("holds nothing until a photo has been read", () => {
    expect(heldLabelRead()).toBeNull();
  });

  it("holds the ingredients and read token", () => {
    holdLabelRead({ ingredients: ["aqua", "glycerin"] });

    expect(heldLabelRead()).toEqual({
      ingredients: ["aqua", "glycerin"],
    });
  });

  it("is replaced by the next read, not merged with it", () => {
    holdLabelRead({ ingredients: ["aqua"] });
    holdLabelRead({ ingredients: ["glycerin"] });

    expect(heldLabelRead()).toEqual({ ingredients: ["glycerin"] });
  });

  it("is empty again once cleared", () => {
    holdLabelRead({ ingredients: ["aqua"] });
    clearLabelRead();

    expect(heldLabelRead()).toBeNull();
  });
});
