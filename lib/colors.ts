/**
 * Raw hex values for the palette in `tailwind.config.js`. NativeWind
 * `className` covers views and text, but a few RN props (ActivityIndicator's
 * `color`, navigation `headerTintColor`, react-native-svg `fill`) take a
 * literal color, not a className. Keep this file in sync with the config.
 */
export const COLORS = {
  canvas: "#FAF7F3",
  surface: "#FFFFFF",

  tintPink: "#F7D9DA",
  tintPeach: "#FBE4D8",
  tintMint: "#D9EDE3",
  tintLilac: "#EDE9F6",

  accent: "#7A6BB0",
  accentDeep: "#625786",
  accentText: "#625786",

  ink: "#332E3A",
  inkBody: "#4A4453",
  inkMuted: "#8C8592",
  inkFaint: "#9E98A3",

  hairline: "#EFEAE4",
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

  panelSuccess: "#EAF3EC",
  panelSuccessLine: "#DCEBE0",
  panelRisk: "#EDF4EF",
  panelRiskLine: "#DFEBE3",
  panelWash: "#F3EFEA",
} as const;
