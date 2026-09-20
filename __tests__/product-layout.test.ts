import { productPictureSize } from "@/lib/product-layout";

const base = { reserved: 100, min: 64, max: 150, fallback: 120 };

describe("productPictureSize", () => {
  it("uses the fallback until the screen and the content are measured", () => {
    expect(productPictureSize({ ...base, viewport: 0, rest: 300 })).toBe(120);
    expect(productPictureSize({ ...base, viewport: 800, rest: 0 })).toBe(120);
  });
  it("takes exactly the room that is left", () => {
    expect(productPictureSize({ ...base, viewport: 500, rest: 300 })).toBe(100);
  });
  it("never goes above the maximum or below the minimum", () => {
    expect(productPictureSize({ ...base, viewport: 900, rest: 300 })).toBe(150);
    expect(productPictureSize({ ...base, viewport: 420, rest: 300 })).toBe(64);
  });
});
