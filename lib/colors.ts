/**
 * Raw hex values for the palette in `tailwind.config.js`. NativeWind
 * `className` covers views and text, but a few RN props (ActivityIndicator's
 * `color`, navigation `headerTintColor`, react-native-svg `fill`) take a
 * literal color, not a className. Keep this file in sync with the config.
 */
export const COLORS = {
  canvas: "#F8F9F4", // v9 pale sage page
  surface: "#FFFFFF",

  tintPink: "#F7D9DA",
  tintMint: "#D9EDE3",
  tintLilac: "#EDE9F6",

  accent: "#7A6BB0",
  accentDeep: "#625786",
  accentText: "#625786",

  ink: "#2F2C2A",
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
  levelGood: "#8A9A5B",
  levelWatch: "#E78B30",
  levelNeutral: "#524D48",
  levelAvoid: "#E56B65",

  panelWash: "#F3EFEA",

  // The FOR.ME shell palette — onboarding, the quiz and the selected-outline
  // accent that several screens reuse. It is a genuinely separate system from
  // the palette above rather than a second copy of it, but it was declared in
  // `components/shell/shared.tsx`, which made that file a third place raw hex
  // lived. These are the values; `shared.tsx` re-exports them under its own
  // names so its ten importers are unaffected.
  shellTerracotta: "#757959", // v9 leaf sage: no terracotta anywhere (name kept for its importers)
  shellSand: "#E3DFDA",
  // The intro screens' own type and button colours, given by the owner
  // (26 September 2026). Intro only: the quiz, the tab bar and the scanner
  // keep the shell colours above.
  introAccent: "#62664B", // v9 // the headline's first phrase, the active dot, Back
  introInk: "#2F2C2A", // v9 // the rest of the headline
  // The owner's #8F8275 darkened 13.5%, the least that reaches 4.5:1 on CANVAS
  // (computed); at 3.56:1 the original was too faint for text this size (#373).
  introMuted: "#5E5954", // v9 // subtext, Skip, the inactive dots

  // Buttons: v9 (1 October 2026) swaps terracotta for leaf sage; the v7 note
  // below is history. Every
  // filled button is terracotta #BA765F with a white SF 16 semibold label:
  // 3.59:1, which clears the 3:1 WCAG asks of large text (16pt bold counts),
  // though not the 4.5:1 of body text — so a button label is never set
  // smaller or lighter than that. Pressed #A5654F. The terracotta text link
  // (buttonTertiary) stays #9C6350, 4.87:1 on white. A destructive action
  // (Report a mistake) is #A8453A, 5.87:1 with white.
  buttonPrimary: "#757959", // every filled button (v9 leaf sage; white label 4.53:1, computed; nudged from #767A5C (4.46) on 7 October 2026 critique, a change the eye does not see)
  buttonPrimaryPressed: "#62664B",
  buttonPrimaryText: "#FFFFFF",
  buttonSecondary: "#EEEFE7", // a less critical action (v9 pale sage, ink label)
  buttonTertiary: "#62664B", // outline and label of a low-emphasis action
  buttonDisabled: "#C9CCB8", // any variant, disabled (v9, read off the hand-off)
} as const;
