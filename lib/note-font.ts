import { Caveat_500Medium } from "@expo-google-fonts/caveat";
import { useFonts } from "expo-font";
import { useEffect, useState } from "react";
import { AccessibilityInfo, useWindowDimensions, type TextStyle } from "react-native";

import { NOTE_FONT, TYPE } from "@/lib/tokens";

/**
 * Whether a journal note is shown in handwriting (#229), and at what size.
 *
 * React Native does not reliably fall back glyph by glyph, so a note is
 * never part handwriting and part something else: the whole note is in the
 * handwritten face, or the whole note is in the UI font. The UI font (San
 * Francisco on iOS) reads Hangul, emoji and every other script natively,
 * which is what makes it the safe side of every one of these decisions.
 */

/** What `_layout.tsx` preloads and `useNoteFont` waits on. */
export const NOTE_FONT_SOURCE = { [NOTE_FONT]: Caveat_500Medium };

/**
 * The code points the handwritten face draws, as inclusive ranges — read off
 * the font file's own character map, and held to it by
 * `__tests__/note-font.test.tsx`. Deliberately narrower than the file: basic
 * and extended Latin, basic Cyrillic and everyday punctuation. Anything else
 * — Hangul, CJK, emoji, a combining accent — sends the whole note to the UI
 * font.
 */
export const SCRIPT_COVERAGE: readonly (readonly [number, number])[] = [
  [0x20, 0x7e], // printable ASCII
  [0xa0, 0x17e], // Latin-1 Supplement, Latin Extended-A
  [0x400, 0x45f], // basic Cyrillic
  [0x2010, 0x2010], // hyphen
  [0x2013, 0x2014], // en and em dash
  [0x2018, 0x201a], // single quotes
  [0x201c, 0x201e], // double quotes
  [0x2020, 0x2022], // dagger, bullet
  [0x2026, 0x2026], // ellipsis
  [0x20ac, 0x20ac], // euro
  [0x2122, 0x2122], // trade mark
];

/** Line breaks are layout, not glyphs, so they never count against a note. */
const LINE_BREAKS = new Set([0x0a, 0x0d]);

export function inScriptCoverage(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (LINE_BREAKS.has(code)) continue;
    if (!SCRIPT_COVERAGE.some(([from, to]) => code >= from && code <= to)) return false;
  }
  return true;
}

/**
 * The decision, pure. Larger text or Bold Text means the person has asked
 * for legibility, and a script face is the opposite — so the note goes to
 * the UI font and scales freely, rather than the handwriting being capped
 * to keep the look. Until the font has loaded, the note is in the UI font
 * too, so it is never invisible or blank while waiting.
 */
export function usesHandwriting(
  text: string,
  { loaded, fontScale, boldText }: { loaded: boolean; fontScale: number; boldText: boolean },
): boolean {
  return loaded && fontScale <= 1 && !boldText && inScriptCoverage(text);
}

/**
 * Where a note is shown. Each place has a size for the handwriting and one
 * for the UI font: the script face sits small on its body, so it needs a
 * step up to read at the same size as the text around it.
 */
const NOTE_TEXT: Record<"card" | "preview", { handwritten: TextStyle; plain: TextStyle }> = {
  card: {
    handwritten: { fontFamily: NOTE_FONT, fontSize: TYPE.title, lineHeight: 26 },
    plain: { fontSize: TYPE.body, lineHeight: 22 },
  },
  preview: {
    handwritten: { fontFamily: NOTE_FONT, fontSize: TYPE.body, lineHeight: 20 },
    plain: { fontSize: TYPE.caption, lineHeight: 17 },
  },
};

function noteTextStyle(where: keyof typeof NOTE_TEXT, handwritten: boolean): TextStyle {
  return NOTE_TEXT[where][handwritten ? "handwritten" : "plain"];
}

/** iOS's Bold Text setting. Other platforms don't report one, so it reads as off. */
function useBoldText(): boolean {
  const [bold, setBold] = useState(false);
  useEffect(() => {
    if (typeof AccessibilityInfo.isBoldTextEnabled !== "function") return;
    let live = true;
    AccessibilityInfo.isBoldTextEnabled()
      .then((on) => live && setBold(on))
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("boldTextChanged", setBold);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return bold;
}

/** The style for one note, in one place — re-decided as the note or the settings change. */
export function useNoteTextStyle(text: string, where: keyof typeof NOTE_TEXT): TextStyle {
  const [loaded] = useFonts(NOTE_FONT_SOURCE);
  const { fontScale } = useWindowDimensions();
  const boldText = useBoldText();
  return noteTextStyle(where, usesHandwriting(text, { loaded, fontScale, boldText }));
}
