/**
 * How large the product picture can be so that everything on the product screen
 * — picture, name, cards — ends where the ingredients sheet begins.
 *
 * `viewport` is the scroll area's height, `rest` the height of everything under
 * the picture, `reserved` what is kept clear at the top and bottom (padding, the
 * sheet's peek) plus the gap between the picture and the rest. Falls back until
 * both have been measured, and stays within `min`..`max`.
 */
export function productPictureSize({
  viewport,
  rest,
  reserved,
  min,
  max,
  fallback,
}: {
  viewport: number;
  rest: number;
  reserved: number;
  min: number;
  max: number;
  fallback: number;
}): number {
  if (viewport <= 0 || rest <= 0) return fallback;
  return Math.min(max, Math.max(min, viewport - reserved - rest));
}
