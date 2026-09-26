/**
 * How big the handwritten "Hi, there!" on Home is drawn.
 *
 * It is a picture, so it does not grow with the phone's text-size setting on its
 * own; this makes it follow the font scale, up to a limit. Pure, so the
 * arithmetic can be tested without rendering.
 */

/** The greeting's width at the default text size. */
export const GREETING_WIDTH = 172;

/** Beyond this the greeting stops growing, so very large text cannot push everything else off the screen. */
const GREETING_MAX_FONT_SCALE = 1.5;

export function homeGreetingWidth(fontScale: number): number {
  return GREETING_WIDTH * Math.min(Math.max(fontScale, 1), GREETING_MAX_FONT_SCALE);
}
