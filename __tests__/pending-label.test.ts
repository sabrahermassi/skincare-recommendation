import { clearLabelRead, heldLabelRead, holdLabelRead } from "@/lib/pending-label";

describe("the label read being added", () => {
  afterEach(clearLabelRead);

  it("holds nothing until a photo has been read", () => {
    expect(heldLabelRead()).toBeNull();
  });

  it("holds the list and the barcode that came with it", () => {
    holdLabelRead({ ingredients: ["aqua", "glycerin"], barcode: "8801234567890", readToken: "t1" });

    expect(heldLabelRead()).toEqual({
      ingredients: ["aqua", "glycerin"],
      barcode: "8801234567890",
      readToken: "t1",
      receivedAt: expect.any(Number),
    });
  });

  it("is replaced by the next read, not merged with it", () => {
    holdLabelRead({ ingredients: ["aqua"], barcode: "8801234567890", readToken: "t1" });
    holdLabelRead({ ingredients: ["glycerin"], readToken: "t2" });

    expect(heldLabelRead()).toEqual({ ingredients: ["glycerin"], readToken: "t2", receivedAt: expect.any(Number) });
  });

  it("holds the receipt time a test provides, rather than stamping its own", () => {
    holdLabelRead({ ingredients: ["aqua"], readToken: "t1", receivedAt: 12345 });

    expect(heldLabelRead()).toEqual({ ingredients: ["aqua"], readToken: "t1", receivedAt: 12345 });
  });

  it("is empty again once cleared", () => {
    holdLabelRead({ ingredients: ["aqua"], readToken: "t1" });
    clearLabelRead();

    expect(heldLabelRead()).toBeNull();
  });
});
