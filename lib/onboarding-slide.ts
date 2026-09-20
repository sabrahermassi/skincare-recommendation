/** +1 when moving forward through the intro (content leaves to the left and the
 *  next arrives from the right), -1 when going back. */
export function slideDirection(previousIndex: number, nextIndex: number): 1 | -1 {
  return nextIndex > previousIndex ? 1 : -1;
}
