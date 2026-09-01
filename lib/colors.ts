/**
 * Raw hex values for the palette in `tailwind.config.js`. NativeWind
 * `className` covers views and text, but a few RN props (ActivityIndicator's
 * `color`, navigation `headerTintColor`, react-native-svg `fill`) take a
 * literal color, not a className. Keep this file in sync with the config.
 */
export const COLORS = {
  canvas: "#FDFBF9",
  surface: "#FFFFFF",

  tintPink: "#F7D9DA",
  tintPeach: "#FBE4D8",
  tintMint: "#D9EDE3",
  tintLilac: "#E3DCF0",

  accent: "#6B5E96",
  accentDeep: "#544879",
  accentText: "#5E5288",

  ink: "#4A3F52",
  inkMuted: "#7A6F82",
  inkFaint: "#A398AE",

  hairline: "#E8DFE4",

  statusSafe: "#3F7D5F",
  statusCaution: "#8A6314",
  statusWatch: "#A2521F",
  statusAvoid: "#B04A3F",
} as const;
