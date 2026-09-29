/**
 * Raw hex values for the palette in `tailwind.config.js`. NativeWind
 * `className` covers views and text, but a few RN props (ActivityIndicator's
 * `color`, navigation `headerTintColor`, react-native-svg `fill`) take a
 * literal color, not a className. Keep this file in sync with the config.
 */
export const COLORS = {
  canvas: "#FCFAF7",
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
  levelGood: "#4A7A54",
  levelWatch: "#B8672F",
  levelNeutral: "#6B5A54",
  levelAvoid: "#A8453A",

  panelWash: "#F3EFEA",

  // The FOR.ME shell palette — onboarding, the quiz and the selected-outline
  // accent that several screens reuse. It is a genuinely separate system from
  // the palette above rather than a second copy of it, but it was declared in
  // `components/shell/shared.tsx`, which made that file a third place raw hex
  // lived. These are the values; `shared.tsx` re-exports them under its own
  // names so its ten importers are unaffected.
  shellTerracotta: "#BA765F", // v7: the one terracotta (was #C4654F)
  shellSand: "#E8DDD1",
  // The intro screens' own type and button colours, given by the owner
  // (26 September 2026). Intro only: the quiz, the tab bar and the scanner
  // keep the shell colours above.
  introAccent: "#9B614E", // the headline's first phrase, the active dot, Back
  introInk: "#240904", // the rest of the headline
  // The owner's #8F8275 darkened 13.5%, the least that reaches 4.5:1 on CANVAS
  // (computed); at 3.56:1 the original was too faint for text this size (#373).
  introMuted: "#7C7065", // subtext, Skip, the inactive dots

  // Buttons (v7 design, 29 September 2026, read off the hand-off). Every
  // filled button is terracotta #BA765F with a white SF 16 semibold label:
  // 3.59:1, which clears the 3:1 WCAG asks of large text (16pt bold counts),
  // though not the 4.5:1 of body text — so a button label is never set
  // smaller or lighter than that. Pressed #A5654F. The terracotta text link
  // (buttonTertiary) stays #9C6350, 4.87:1 on white. A destructive action
  // (Report a mistake) is #A8453A, 5.87:1 with white.
  buttonPrimary: "#BA765F", // every filled button
  buttonPrimaryPressed: "#A5654F",
  buttonPrimaryText: "#FFFFFF",
  buttonSecondary: "#D4A88F", // a less critical action
  buttonTertiary: "#9C6350", // outline and label of a low-emphasis action
  buttonDisabled: "#D9C9BE", // any variant, disabled
  buttonDestructive: "#A8453A",
} as const;
