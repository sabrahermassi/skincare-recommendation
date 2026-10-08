/**
 * The screen before the skin quiz (#471). The owner's words, kept in one place
 * so the claims-policy test reads exactly what the screen shows. The age line
 * is the owner's too (7 October 2026); a lawyer may change it later.
 */
export const CONSENT_COPY = {
  title: "Before we ask about your skin",
  lines: [
    "We'll ask about your skin concerns, skin type, sensitivity, and whether you're pregnant or breastfeeding.",
    "We use your answers only to score products for you.",
    "They stay on this phone. They are not sent to us or to your account.",
    "You can change or delete them any time in Profile.",
    "You must be 16 or older to use for.me.",
  ],
  privacyLink: "Read the privacy policy",
  agree: "I agree, continue",
  notNow: "Not now",
} as const;
