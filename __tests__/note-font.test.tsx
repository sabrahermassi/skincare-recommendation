import { act, render, screen } from "@testing-library/react-native";
import { readFileSync } from "fs";
import { join } from "path";
import { AccessibilityInfo, StyleSheet } from "react-native";

import { NotePreview, ProductNote } from "@/components/ProductNote";
import { SCRIPT_COVERAGE, inScriptCoverage, usesHandwriting } from "@/lib/note-font";
import { NOTE_FONT } from "@/lib/tokens";

/**
 * A journal note in handwriting (#229): only where the face can draw every
 * character, only when the person hasn't asked for larger or bolder text,
 * and always the whole note one way or the other.
 */

jest.mock("expo-font", () => ({
  ...jest.requireActual<object>("expo-font"),
  useFonts: () => [true, null],
}));

// React Native's Jest setup reports a text scale of 2; a phone at the default
// size reports 1.
let mockFontScale = 1;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: mockFontScale }),
}));
beforeEach(() => {
  mockFontScale = 1;
});

/** Every code point the font file maps, read from its own `cmap` table. */
function fontCodePoints(file: string): Set<number> {
  const font = readFileSync(file);
  let cmap = 0;
  for (let i = 0; i < font.readUInt16BE(4); i++) {
    if (font.toString("latin1", 12 + 16 * i, 16 + 16 * i) === "cmap") cmap = font.readUInt32BE(20 + 16 * i);
  }
  const points = new Set<number>();
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
    const sub = cmap + font.readUInt32BE(cmap + 8 + 8 * i);
    if (font.readUInt16BE(sub) !== 4) continue;
    const segments = font.readUInt16BE(sub + 6) / 2;
    for (let s = 0; s < segments; s++) {
      const end = font.readUInt16BE(sub + 14 + 2 * s);
      const start = font.readUInt16BE(sub + 16 + 2 * segments + 2 * s);
      if (start !== 0xffff) for (let c = start; c <= end; c++) points.add(c);
    }
  }
  return points;
}

const fontOf = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style).fontFamily;

describe("which characters the handwriting draws", () => {
  it("claims nothing the font file cannot draw", () => {
    const file = join(__dirname, "..", "node_modules/@expo-google-fonts/caveat/500Medium/Caveat_500Medium.ttf");
    const drawn = fontCodePoints(file);
    const missing = SCRIPT_COVERAGE.flatMap(([from, to]) =>
      Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((code) => !drawn.has(code)),
    );
    expect(missing).toEqual([]);
  });

  it("is the token tailwind names", () => {
    const tailwind = jest.requireActual<{ theme: { extend: { fontFamily: Record<string, string[]> } } }>(
      "../tailwind.config.js",
    );
    expect(tailwind.theme.extend.fontFamily.note).toEqual([NOTE_FONT]);
  });

  it.each([
    ["an English note, line breaks and curly quotes", "Loved it — “really”.\nWould buy again…"],
    ["accents", "Très doux, crème légère"],
  ])("takes %s", (_: string, text: string) => {
    expect(inScriptCoverage(text)).toBe(true);
  });

  it.each([
    ["a Korean note", "촉촉하고 좋아요"],
    ["a mostly English note with one Korean word", "Nice and light, 좋아요"],
    ["emoji", "Love it 😍"],
    ["CJK", "很好用"],
    ["a combining accent", "crème"],
  ])("gives up on %s", (_: string, text: string) => {
    expect(inScriptCoverage(text)).toBe(false);
  });
});

describe("when the handwriting steps aside", () => {
  const settled = { loaded: true, fontScale: 1, boldText: false };

  it("is used at the default text size once loaded", () => {
    expect(usesHandwriting("Soft and calm", settled)).toBe(true);
  });

  it("waits for the font rather than showing nothing", () => {
    expect(usesHandwriting("Soft and calm", { ...settled, loaded: false })).toBe(false);
  });

  it("gives way to larger text and Bold Text, rather than capping the note's size", () => {
    expect(usesHandwriting("Soft and calm", { ...settled, fontScale: 1.15 })).toBe(false);
    expect(usesHandwriting("Soft and calm", { ...settled, boldText: true })).toBe(false);
  });
});

describe("a note on screen", () => {
  it("is handwritten on the product screen and the Saved card", async () => {
    await render(<ProductNote note="Soft and calm" onSave={() => undefined} />);
    expect(fontOf("Soft and calm")).toBe(NOTE_FONT);
    await render(<NotePreview note="Worth it" />);
    expect(fontOf("Worth it")).toBe(NOTE_FONT);
  });

  it("puts a Korean note entirely in the UI font, in both places", async () => {
    const note = "Nice and light, 촉촉해요";
    await render(<ProductNote note={note} onSave={() => undefined} />);
    expect(fontOf(note)).toBeUndefined();
    await render(<NotePreview note={note} />);
    expect(fontOf(note)).toBeUndefined();
  });

  it("follows the phone's text size", async () => {
    mockFontScale = 1.3;
    await render(<ProductNote note="Soft and calm" onSave={() => undefined} />);
    expect(fontOf("Soft and calm")).toBeUndefined();
  });

  it("follows iOS's Bold Text setting", async () => {
    const bold = jest.spyOn(AccessibilityInfo, "isBoldTextEnabled").mockResolvedValue(true);
    await render(<ProductNote note="Soft and calm" onSave={() => undefined} />);
    await act(async () => undefined);
    expect(fontOf("Soft and calm")).toBeUndefined();
    bold.mockRestore();
  });
});
