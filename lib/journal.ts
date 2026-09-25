/**
 * The journal note on a saved product (#228): the person's own words, the
 * most personal thing the account holds.
 *
 * **The note itself is never audited, rewritten or refused for wording.**
 * `docs/claims-policy.md` governs what the *app* says; a note is what the
 * person says. Only the app's own copy around it — the prompt, the
 * placeholder, the empty state, the length message — is app-authored, and
 * that is what `NOTE_COPY` holds and `__tests__/claims-policy.test.ts`
 * audits.
 *
 * **The prompt asks about the product, never about skin.** "How did your
 * skin feel?" would invite a symptom diary into a server-side free-text
 * column; the app doesn't solicit that. People may still write anything —
 * that's their right — but the app isn't the one asking.
 *
 * Never shared, never copied out, never in an analytics event.
 */

/** The same cap as the `note` column in migration 0025. */
export const MAX_NOTE_CHARS = 500;

export const NOTE_COPY = {
  heading: "Your note",
  add: "Add a note",
  edit: "Edit",
  prompt: "What did you think of it?",
  placeholder: "Worth buying again? How does it wear? Anything you'd tell a friend.",
  save: "Save note",
  delete: "Delete note",
  cancel: "Cancel",
} as const;

/**
 * What the editor says when a note is over the cap — pasted in, most often.
 * The note is never cut down silently: the extra is counted out loud, and
 * saving waits until the person decides what to cut.
 */
export function tooLongCopy(length: number): string {
  const over = length - MAX_NOTE_CHARS;
  return `${over} character${over === 1 ? "" : "s"} over the ${MAX_NOTE_CHARS} a note can hold. Trim it to save.`;
}

/** A note as stored: trimmed, and no note at all when there's nothing left. */
export function cleanNote(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}
