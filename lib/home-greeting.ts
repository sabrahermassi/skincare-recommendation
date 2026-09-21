/**
 * How big the handwritten greeting and signature on Home are drawn.
 *
 * Both are pictures, so neither grows with the phone's text-size setting on its
 * own, and the signature floats at the right edge of the same band the greeting
 * fills from the left. On a narrow phone (or with large text) the two would
 * overpaint each other, so the greeting follows the font scale and the signature
 * takes only the room the greeting leaves, and is left out when there is too
 * little. Pure, so the arithmetic can be tested without rendering.
 */

/** The greeting's width at the default text size. */
export const GREETING_WIDTH = 172;
/** The signature's width when there is room for it. */
export const SIGNATURE_WIDTH = 128;

/** Beyond this the greeting stops growing, so very large text cannot push everything else off the screen. */
const GREETING_MAX_FONT_SCALE = 1.5;
/** Narrower than this the signature is not legible, so it is left out instead. */
const MIN_SIGNATURE_WIDTH = 80;
/** Clear space kept between the greeting and the signature. */
const GREETING_SIGNATURE_GAP = 8;

export type HomeGreetingLayout = {
  greetingWidth: number;
  /** Null when the signature would be too small to read: draw nothing. */
  signatureWidth: number | null;
};

export function homeGreetingLayout({
  screenWidth,
  fontScale,
  gutter,
  signatureRight,
}: {
  screenWidth: number;
  fontScale: number;
  /** Left inset of the greeting. */
  gutter: number;
  /** Distance from the screen's right edge to the signature's right edge. */
  signatureRight: number;
}): HomeGreetingLayout {
  const greetingWidth = GREETING_WIDTH * Math.min(Math.max(fontScale, 1), GREETING_MAX_FONT_SCALE);
  const room = screenWidth - signatureRight - (gutter + greetingWidth) - GREETING_SIGNATURE_GAP;
  const signatureWidth = Math.min(SIGNATURE_WIDTH, room);
  return { greetingWidth, signatureWidth: signatureWidth >= MIN_SIGNATURE_WIDTH ? signatureWidth : null };
}
