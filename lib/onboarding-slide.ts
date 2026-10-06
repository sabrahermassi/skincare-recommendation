/** +1 when moving forward through the intro (content leaves to the left and the
 *  next arrives from the right), -1 when going back. */
export function slideDirection(previousIndex: number, nextIndex: number): 1 | -1 {
  return nextIndex > previousIndex ? 1 : -1;
}

/** How far a finger has to travel sideways, in points, before it counts as a swipe. */
export const SWIPE_MIN_DISTANCE = 50;

/**
 * Which way a finger's travel from touch-down to touch-up turns the intro: +1
 * forward (the finger moved left), -1 back (it moved right), 0 for a tap, a
 * short drag, or a drag that is mostly vertical.
 */
export function swipeDirection(dx: number, dy: number): 1 | -1 | 0 {
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < 2 * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}
