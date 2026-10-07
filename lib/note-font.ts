import { Kalam_400Regular } from "@expo-google-fonts/kalam";
import { useFonts } from "expo-font";
import { useEffect, useState } from "react";
import { AccessibilityInfo, useWindowDimensions, type TextStyle } from "react-native";

import { HAND_FONT, LEADING, TIP_NOTE, TYPE } from "@/lib/tokens";

/**
 * Whether a journal note — or Home's Tip of the day — is shown in handwriting
 * (#229), and at what size.
 *
 * React Native does not reliably fall back glyph by glyph, so a note is
 * never part handwriting and part something else: the whole note is in the
 * handwritten face, or the whole note is in the UI font. The UI font (San
 * Francisco on iOS) reads Hangul, emoji and every other script natively,
 * which is what makes it the safe side of every one of these decisions.
 */

/** The handwriting: Kalam, the same face as the tip and Home's greeting (owner, 7 October 2026: one handwriting face, not two). Already loaded with the other fonts at startup. */
export const HAND_FONT_SOURCE = { [HAND_FONT]: Kalam_400Regular };

/**
 * The code points the handwritten face draws, as inclusive ranges — read off
 * the font file's own character map, and held to it by
 * `__tests__/note-font.test.tsx`. Deliberately narrower than the file: basic
 * Latin, the parts of Latin-1 and Latin Extended-A Kalam has, and everyday
 * punctuation. Anything else — Hangul, CJK, Cyrillic, emoji, a combining
 * accent, a few Central European letters — sends the whole note to the UI font.
 * (Kalam has no Cyrillic; Caveat, which this replaced, did.)
 */
export const SCRIPT_COVERAGE: readonly (readonly [number, number])[] = [
  [0x20, 0x7e], // printable ASCII
  [0xa0, 0x107], // Latin-1 Supplement, start of Latin Extended-A
  [0x10c, 0x113],
  [0x116, 0x11b],
  [0x11e, 0x11f],
  [0x122, 0x123],
  [0x12a, 0x12b],
  [0x12e, 0x131],
  [0x136, 0x137],
  [0x139, 0x13e],
  [0x141, 0x148],
  [0x14c, 0x14d],
  [0x150, 0x15b],
  [0x15e, 0x165],
  [0x16a, 0x16b],
  [0x16e, 0x173],
  [0x178, 0x17e],
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
const NOTE_TEXT: Record<"card" | "preview" | "tip", { handwritten: TextStyle; plain: TextStyle }> = {
  card: {
    handwritten: { fontFamily: HAND_FONT, fontSize: TYPE.card, lineHeight: 24 },
    plain: { fontSize: TYPE.body, lineHeight: LEADING.card },
  },
  preview: {
    handwritten: { fontFamily: HAND_FONT, fontSize: TYPE.label, lineHeight: LEADING.label },
    plain: { fontSize: TYPE.caption, lineHeight: LEADING.caption },
  },
  // Home's Tip of the day (v7).
  tip: {
    handwritten: { fontFamily: HAND_FONT, fontSize: TIP_NOTE.fontSize, lineHeight: TIP_NOTE.lineHeight },
    plain: { fontSize: TYPE.body, lineHeight: LEADING.card },
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
  const [loaded] = useFonts(HAND_FONT_SOURCE);
  const { fontScale } = useWindowDimensions();
  const boldText = useBoldText();
  return noteTextStyle(where, usesHandwriting(text, { loaded, fontScale, boldText }));
}
