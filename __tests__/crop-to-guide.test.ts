import { coverFitCropRect, type Rect, type Size } from "@/lib/crop-to-guide";

/**
 * `coverFitCropRect` is pure geometry with no framework dependency, so every
 * case here is exact arithmetic rather than an approximation — the whole
 * point of factoring the "cover" math out of `app/scan-label.tsx` was to
 * make it checkable without a device or a camera.
 */

describe("coverFitCropRect", () => {
  describe("photo wider than the screen (cover crops the photo's sides)", () => {
    // Screen 400x800 (portrait), photo 4000x6000 (a taller-than-screen 2:3
    // sensor). Cover scale = max(400/4000, 800/6000) = max(0.1, 0.1333) =
    // 0.1333 — height is the binding dimension, width overflows and is
    // clipped equally on both sides.
    const container: Size = { width: 400, height: 800 };
    const photo: Size = { width: 4000, height: 6000 };

    it("maps a guide box centered on-screen to a centered box in the photo", () => {
      // The guide box from scan-label.tsx: full width, 38% height, centered.
      const guide: Rect = { x: 0, y: (800 - 304) / 2, width: 400, height: 304 };

      const result = coverFitCropRect(container, photo, guide);
      expect(result).not.toBeNull();
      if (!result) return;

      // scale = max(400/4000, 800/6000) = 0.1333.. (height is binding).
      // offsetX = (4000*scale - 400)/2 = 66.67, offsetY = 0.
      // rawX = (0 + 66.67)/scale = 500, rawY = (248 + 0)/scale = 1860.
      // rawWidth = 400/scale = 3000, rawHeight = 304/scale = 2280.
      // 12% margin on each: marginX=360, marginY=273.6 — large relative to
      // rawX/rawY because the guide box itself maps to a large photo region,
      // not because anything is near an edge.
      expect(result.originX).toBeCloseTo(140, 0);
      expect(result.originY).toBeCloseTo(1586, 0);
      expect(result.width).toBeCloseTo(3720, 0);
      expect(result.height).toBeCloseTo(2827, 0);
      // Sanity checks independent of the hand-derived numbers above: still
      // well inside the photo, and narrower than the full frame.
      expect(result.originX + result.width).toBeLessThanOrEqual(photo.width);
      expect(result.originY + result.height).toBeLessThanOrEqual(photo.height);
      expect(result.width).toBeLessThan(photo.width);
    });

    it("keeps the crop symmetric for a guide box centered on both axes", () => {
      const guide: Rect = { x: 100, y: 300, width: 200, height: 200 };
      const result = coverFitCropRect(container, photo, guide)!;

      // Guide is horizontally centered (100 to 300 out of 400) and
      // vertically centered (300 to 500 out of 800) — the mapped rectangle
      // must be centered in the photo too, since "cover" scaling preserves
      // the center point.
      const photoCenterX = photo.width / 2;
      const photoCenterY = photo.height / 2;
      const cropCenterX = result.originX + result.width / 2;
      const cropCenterY = result.originY + result.height / 2;
      expect(cropCenterX).toBeCloseTo(photoCenterX, 0);
      expect(cropCenterY).toBeCloseTo(photoCenterY, 0);
    });
  });

  describe("photo relatively wider than the screen ratio (cover crops left/right)", () => {
    // Screen 400x800, photo 4000x4000 (square sensor) — width is now the
    // binding dimension (scale = max(400/4000, 800/4000) = max(0.1, 0.2) =
    // 0.2), so height overflows and is clipped top and bottom instead.
    const container: Size = { width: 400, height: 800 };
    const photo: Size = { width: 4000, height: 4000 };

    it("clips horizontally: a screen-covering guide still only recovers the visible slice", () => {
      // scale = max(400/4000, 800/4000) = 0.2 — HEIGHT is binding here (the
      // square photo's height exactly fills the screen height at this
      // scale), so the photo's WIDTH is what overflows and gets clipped by
      // the preview. A guide box spanning the full screen therefore only
      // ever recovers the center slice that was visible on screen — the
      // parts of the photo clipped off left/right by the cover-fit preview
      // were never on screen to be selected from in the first place. This is
      // the correct, if easy-to-misjudge-by-hand, behavior of "cover".
      const guide: Rect = { x: 0, y: 0, width: 400, height: 800 }; // whole screen
      const result = coverFitCropRect(container, photo, guide)!;

      expect(result.originX).toBeCloseTo(760, 0);
      expect(result.originY).toBe(0); // clamped — margin would go negative
      expect(result.width).toBeCloseTo(2480, 0);
      // Less than the full 4000, because the sides were already clipped by
      // the preview before the guide box ever got a say.
      expect(result.width).toBeLessThan(photo.width);
    });
  });

  describe("exact aspect match (no cover clipping at all)", () => {
    // Screen and photo share an aspect ratio exactly: cover scale is the
    // same for both dimensions, so screen-space and photo-space coordinates
    // are related by one uniform scale factor with zero offset.
    const container: Size = { width: 400, height: 800 };
    const photo: Size = { width: 1000, height: 2000 }; // same 1:2 ratio

    it("maps proportionally with no offset", () => {
      const guide: Rect = { x: 40, y: 400, width: 320, height: 100 };
      const result = coverFitCropRect(container, photo, guide)!;

      const scale = photo.width / container.width; // 2.5, uniform on both axes
      const marginlessX = guide.x * scale; // 100
      const marginlessY = guide.y * scale; // 1000
      const marginlessW = guide.width * scale; // 800
      const marginlessH = guide.height * scale; // 250

      // With the 12% margin applied on each side:
      expect(result.originX).toBeCloseTo(marginlessX - marginlessW * 0.12, 0);
      expect(result.originY).toBeCloseTo(marginlessY - marginlessH * 0.12, 0);
      expect(result.width).toBeCloseTo(marginlessW * 1.24, 0);
      expect(result.height).toBeCloseTo(marginlessH * 1.24, 0);
    });
  });

  describe("margin and clamping", () => {
    const container: Size = { width: 100, height: 100 };
    const photo: Size = { width: 100, height: 100 }; // 1:1, uniform scale of 1

    it("adds roughly 12% padding on each side when there's room", () => {
      const guide: Rect = { x: 40, y: 40, width: 20, height: 20 };
      const result = coverFitCropRect(container, photo, guide)!;

      // 20 * 0.12 = 2.4 of margin on each side.
      expect(result.originX).toBe(Math.round(40 - 2.4));
      expect(result.originY).toBe(Math.round(40 - 2.4));
      expect(result.width).toBe(Math.round(20 + 2.4 * 2));
      expect(result.height).toBe(Math.round(20 + 2.4 * 2));
    });

    it("clamps a margin that would push past the photo's edge, rather than going negative", () => {
      const guide: Rect = { x: 0, y: 0, width: 10, height: 10 }; // hard against the top-left
      const result = coverFitCropRect(container, photo, guide)!;

      expect(result.originX).toBe(0);
      expect(result.originY).toBe(0);
      expect(result.width).toBeLessThanOrEqual(photo.width);
      expect(result.height).toBeLessThanOrEqual(photo.height);
    });

    it("clamps against the bottom-right edge the same way", () => {
      const guide: Rect = { x: 85, y: 85, width: 15, height: 15 };
      const result = coverFitCropRect(container, photo, guide)!;

      expect(result.originX + result.width).toBeLessThanOrEqual(photo.width);
      expect(result.originY + result.height).toBeLessThanOrEqual(photo.height);
    });

    it("returns a photo-sized rectangle when the guide covers everything, margin included", () => {
      const guide: Rect = { x: 0, y: 0, width: 100, height: 100 };
      const result = coverFitCropRect(container, photo, guide)!;

      expect(result).toEqual({ originX: 0, originY: 0, width: 100, height: 100 });
    });
  });

  describe("degenerate input", () => {
    const container: Size = { width: 100, height: 100 };
    const photo: Size = { width: 100, height: 100 };
    const guide: Rect = { x: 10, y: 10, width: 10, height: 10 };

    it.each([
      ["zero-width container", { width: 0, height: 100 }, photo, guide],
      ["zero-height photo", container, { width: 100, height: 0 }, guide],
      ["negative-width guide", container, photo, { ...guide, width: -5 }],
      ["zero-height guide", container, photo, { ...guide, height: 0 }],
    ])(
      "returns null for %s rather than a nonsense rectangle",
      (_label: string, c: Size, p: Size, g: Rect) => {
        expect(coverFitCropRect(c, p, g)).toBeNull();
      }
    );
  });

  describe("real-world scale", () => {
    it("produces a small fraction of a real 12MP photo for a typical guide box", () => {
      // A realistic screen and a realistic 4:3 phone sensor photo, with the
      // actual guide box shape from app/scan-label.tsx: full width, 38% of
      // screen height, minus the 24px (px-6) horizontal padding on the
      // container that the guide box's width:"100%" is relative to.
      const container: Size = { width: 390, height: 844 }; // iPhone-ish points
      const photo: Size = { width: 3024, height: 4032 }; // 12MP, 3:4 portrait
      const guide: Rect = { x: 24, y: (844 - 844 * 0.38) / 2, width: 390 - 48, height: 844 * 0.38 };

      const result = coverFitCropRect(container, photo, guide)!;
      const cropArea = result.width * result.height;
      const photoArea = photo.width * photo.height;

      // The whole point of this feature: meaningfully less than the full
      // frame reaches the network, even with the generosity margin.
      expect(cropArea).toBeLessThan(photoArea * 0.5);
      expect(cropArea).toBeGreaterThan(photoArea * 0.05); // and not absurdly tiny
    });
  });
});
