/**
 * Raw hex values for the palette in `tailwind.config.js`. NativeWind
 * `className` covers views and text, but a few RN props (ActivityIndicator's
 * `color`, navigation `headerTintColor`, react-native-svg `fill`) take a
 * literal color, not a className. Keep this file in sync with the config.
 */
export const COLORS = {
  canvas: "#FDF9F0",
  surface: "#FFFFFF",

  tintPink: "#F7D9DA",
  tintMint: "#D9EDE3",
  tintLilac: "#EDE9F6",

  accent: "#7A6BB0",
  accentDeep: "#625786",
  accentText: "#625786",

  ink: "#332E3A",
  inkBody: "#4A4453",
  inkMuted: "#8C8592",
  inkFaint: "#9E98A3",

  hairlineSoft: "#F2EDE7",

  // Per-profile fit (design legend), distinct from the status ramp.
  toneGood: "#79A98A",
  toneWatch: "#E0A063",
  toneFlag: "#E29AA0",

  statusSafe: "#3F7D5F",
  statusCaution: "#8A6314",
  statusWatch: "#A2521F",
  statusAvoid: "#B04A3F",

  // The soft register of the same four rungs — see `level` in the config.
  // Kept equal to that config's DEFAULT values (which are themselves the
  // VERDICT ramp in lib/tokens.ts) rather than a third copy of the palette.
  levelGood: "#3E7D5A",
  levelWatch: "#C2662B",
  levelNeutral: "#6B5A54",
  levelAvoid: "#B23A32",

  panelWash: "#F3EFEA",

  // The FOR.ME shell palette — onboarding, the quiz and the selected-outline
  // accent that several screens reuse. It is a genuinely separate system from
  // the palette above rather than a second copy of it, but it was declared in
  // `components/shell/shared.tsx`, which made that file a third place raw hex
  // lived. These are the values; `shared.tsx` re-exports them under its own
  // names so its ten importers are unaffected.
  shellTerracotta: "#C4654F",
  shellSand: "#E8DDD1",
  // The intro screens' own type and button colours, given by the owner
  // (26 September 2026). Intro only: the quiz, the tab bar and the scanner
  // keep the shell colours above.
  introAccent: "#9B614E", // the headline's first phrase, the active dot, Back
  introInk: "#240904", // the rest of the headline
  // The owner's #8F8275 darkened 13.5%, the least that reaches 4.5:1 on CANVAS
  // (computed); at 3.56:1 the original was too faint for text this size (#373).
  introMuted: "#7C7065", // subtext, Skip, the inactive dots

  // Buttons (owner, 27 September 2026), matched to the intro illustrations.
  // Contrast computed, not read off a mockup (WCAG relative luminance).
  // Primary and tertiary are the owner's #BA765F darkened to #9C6350 (owner's
  // choice, 27 September): white on #BA765F was 3.6:1 and #BA765F text on the
  // canvas 3.4:1, both short of 4.5:1 for labels this size. Now white on
  // buttonPrimary is 4.9:1 and buttonTertiary text on the canvas 4.6:1.
  // White on buttonSecondary is 2.1:1, so its label is ink instead (7.6:1).
  buttonPrimary: "#9C6350", // the one main action on a screen
  buttonPrimaryText: "#FFFFFF",
  buttonSecondary: "#D4A88F", // a less critical action
  buttonTertiary: "#9C6350", // outline and label of a low-emphasis action
  buttonDisabled: "#E8D9CE", // any variant, disabled
} as const;
