/**
 * Map the on-screen guide box a user frames a label inside into a crop
 * rectangle in the captured photo's own pixel coordinates.
 *
 * `app/scan-label.tsx` draws a guide box over the camera preview and asks the
 * user to fill it with the ingredient list, but until this existed that box
 * was decoration only — `takePictureAsync` returns the full sensor frame no
 * matter what's drawn on top of it, so everything around the bottle (a hand,
 * a shelf, whatever's in the background) was sent to Google Vision along with
 * the label. This is what makes "fill the frame" true for what's actually
 * transmitted, not just what's shown — see issue #16.
 *
 * The reason this needs real math rather than a straight percentage crop:
 * the camera preview fills its container the way CSS `background-size:
 * cover` fills a box — scaled up until both dimensions are at least the
 * container's, then centered and clipped — and the photo's aspect ratio
 * essentially never matches the screen's exactly. A guide box drawn at 38%
 * of screen height does not correspond to 38% of the photo's height unless
 * the two share an aspect ratio, which they don't in general.
 *
 * Pure and framework-free on purpose: the geometry is fully described by
 * three rectangles' dimensions, so it can be exhaustively unit tested
 * without a device, a camera, or React Native at all. `app/scan-label.tsx`
 * supplies the three inputs from real `onLayout` measurements and the real
 * `takePictureAsync` result.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What `expo-image-manipulator`'s crop action takes. */
export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * Extra room added around the guide box before cropping, as a fraction of
 * its own width/height on each side.
 *
 * A user's framing is never pixel-perfect, and a crop that clips the last
 * ingredient name because the box sat a few pixels short is a worse outcome
 * than one that sends a slightly generous label region — the whole point is
 * to stop sending the rest of the scene, not to shave the last few percent
 * off an already-tight crop. 12% keeps that margin meaningful while still
 * being a large reduction against today's "send the entire frame."
 */
const MARGIN_FRACTION = 0.12;

/**
 * Compute the crop rectangle, in photo pixels, corresponding to `guide` as
 * drawn over a `container`-sized camera preview of a `photo`-sized capture.
 *
 * All three inputs must be measured in the same units as each other (screen
 * points from `onLayout`, or device pixels — doesn't matter, only the ratios
 * between them are used) except `photo`, which is always in the pixels
 * `takePictureAsync` reports.
 *
 * Returns `null` when any input is degenerate (zero or negative width/height
 * anywhere) — callers should fall back to the uncropped photo rather than
 * hand a manipulator library a rectangle that can't mean anything.
 */
export function coverFitCropRect(container: Size, photo: Size, guide: Rect): CropRect | null {
  if (
    container.width <= 0 ||
    container.height <= 0 ||
    photo.width <= 0 ||
    photo.height <= 0 ||
    guide.width <= 0 ||
    guide.height <= 0
  ) {
    return null;
  }

  // The "cover" display scale: the factor the photo is blown up by so that
  // BOTH its displayed dimensions are at least the container's. Whichever
  // dimension is the tighter fit determines the scale; the other overflows
  // and is what gets clipped, centered, by the preview.
  const scale = Math.max(container.width / photo.width, container.height / photo.height);

  const displayedWidth = photo.width * scale;
  const displayedHeight = photo.height * scale;
  // How much of the displayed (scaled-up) photo sits outside the container
  // on each side, in the same units as `container`/`guide` — this is exactly
  // the offset a screen-space coordinate needs before it can be divided back
  // down into photo-space.
  const offsetX = (displayedWidth - container.width) / 2;
  const offsetY = (displayedHeight - container.height) / 2;

  const rawX = (guide.x + offsetX) / scale;
  const rawY = (guide.y + offsetY) / scale;
  const rawWidth = guide.width / scale;
  const rawHeight = guide.height / scale;

  // Margin is applied in photo pixels, after the scale conversion, so it
  // scales with the guide box's own true size rather than the screen's.
  const marginX = rawWidth * MARGIN_FRACTION;
  const marginY = rawHeight * MARGIN_FRACTION;

  return clampToPhoto(
    {
      x: rawX - marginX,
      y: rawY - marginY,
      width: rawWidth + marginX * 2,
      height: rawHeight + marginY * 2,
    },
    photo
  );
}

/**
 * Clip a rectangle to a photo's bounds without shrinking it toward the
 * wrong edge — clamping origin and size independently would let a
 * negative origin silently grow the rectangle past the far edge instead of
 * just being pulled back on-frame. Returns `null` if what's left has no
 * area, which can only happen if the guide box shared no overlap with the
 * photo at all — a `container`/`guide` pairing that doesn't correspond to
 * the same capture.
 */
function clampToPhoto(rect: Rect, photo: Size): CropRect | null {
  const x1 = Math.max(0, rect.x);
  const y1 = Math.max(0, rect.y);
  const x2 = Math.min(photo.width, rect.x + rect.width);
  const y2 = Math.min(photo.height, rect.y + rect.height);

  const width = x2 - x1;
  const height = y2 - y1;
  if (width <= 0 || height <= 0) return null;

  // expo-image-manipulator's crop rejects non-integer origins/dimensions on
  // some platforms; rounding here is the one place that needs to happen.
  return {
    originX: Math.round(x1),
    originY: Math.round(y1),
    width: Math.round(width),
    height: Math.round(height),
  };
}
