import { Image } from "expo-image";

/**
 * The profile portrait from the design project (`assets/avatar-round.png`).
 *
 * An earlier pass substituted the user's skin-type tile here, on the reasoning
 * that a generic face says nothing true about the profile. That was a judgement
 * the design had already made — the illustration is the author's own, it is in
 * the project, and swapping it for a different icon was not mine to do.
 */
export function Avatar({ size = 52 }: { size?: number }) {
  return (
    <Image
      source={require("@/assets/images/avatar-round.png")}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      transition={120}
      accessibilityLabel="Your skin profile"
    />
  );
}
