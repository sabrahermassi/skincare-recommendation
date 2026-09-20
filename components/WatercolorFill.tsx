import { Image } from "expo-image";
import { StyleSheet } from "react-native";

// A wash of pigment density around #E58D6D — see the note on the component.
const WATERCOLOR_CTA = require("@/assets/textures/watercolor-cta.png");

/**
 * The paint under a filled accent surface: the fill is not one flat colour but a
 * very faint, irregular variation in pigment density, like the washes in the
 * app's illustrations. It is a picture, not a gradient — a gradient reads as
 * digital however it is tuned — and it varies between roughly #DC8063 and
 * #EA9B7D around a mean of #E58D6D, so the surface still reads as one colour.
 *
 * Fills whatever it is placed in (which must clip: `overflow: "hidden"` and a
 * radius), sits under its siblings, and ignores touches. The parent's own
 * background stays as the colour shown while the picture loads.
 *
 * `assets/textures/watercolor-cta.png` is a generated stand-in (640×200, opaque).
 * A painted or scanned wash at the same path, roughly 3:1 and kept within the
 * same colour range, replaces it with no code change.
 *
 * For filled accent and call-to-action surfaces only, not for the UI at large.
 */
export function WatercolorFill() {
  return (
    <Image
      source={WATERCOLOR_CTA}
      contentFit="cover"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    />
  );
}
