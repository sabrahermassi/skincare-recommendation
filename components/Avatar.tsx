import { Image } from "expo-image";

/**
 * The profile portrait, next to "Your skin profile" on the profile screen.
 *
 * Replaces the design project's original round headshot
 * (`assets/images/avatar-round.png`, deleted — nothing else referenced it)
 * with the new illustration set's `girl-mirror` piece
 * (`assets/illustrations/profile/girl-mirror.png`), moved out of the
 * unsorted `assets/new illustrations/` drop folder into a proper home,
 * matching how the onboarding artwork lives under
 * `assets/illustrations/onboarding/`.
 */
export function Avatar({ size = 52 }: { size?: number }) {
  return (
    <Image
      source={require("@/assets/illustrations/profile/girl-mirror.png")}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      transition={120}
      accessibilityLabel="Your skin profile"
    />
  );
}
