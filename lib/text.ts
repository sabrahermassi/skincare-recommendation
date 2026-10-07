/**
 * Keeps a line's last two words together, so a heading or short line never ends
 * with one word alone ("What would you like to work / on?"). React Native has no
 * balanced wrapping, so the last space becomes a non-breaking one. A text of one
 * or two words is left alone: there is nothing to keep it from.
 */
export function noOrphan(text: string): string;
export function noOrphan(text: string | undefined): string | undefined;
export function noOrphan(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const words = text.trim().split(/\s+/);
  if (words.length < 3) return text;
  const at = text.lastIndexOf(" ");
  return at < 0 ? text : `${text.slice(0, at)} ${text.slice(at + 1)}`;
}
