/**
 * Tip of the day (v7): the handwritten note on Home. Written by the owner
 * (29 September 2026), kept word for word. Everyone sees the same tip on the
 * same day, and it changes at local midnight. Held to the claims policy by
 * `__tests__/claims-policy.test.ts`.
 */
export const TIPS: readonly string[] = [
  "Double cleanse at night — oil or butter first, then a gentle foaming wash.",
  "Pat toner into skin with your palms instead of rubbing it in.",
  "Layer products from thinnest to thickest, watery to creamy.",
  "Sunscreen belongs in your routine even on cloudy or indoor days.",
  "Patch test a new product before adding it to your full routine.",
  "Damp skin holds hydration well, so apply essence right after washing.",
  "A few products used consistently beat ten used occasionally.",
  "Sheet masks are a nice pause, not a fifteen-minute miracle.",
  "Your neck and hands enjoy moisturizer just as much as your face.",
  "Lukewarm water is gentler on skin than a hot, steamy rinse.",
  "Change your pillowcase often — it touches your face all night.",
  "Reapply sunscreen through the day, not just once each morning.",
  "A humid room can make dry winter skin feel a little happier.",
  "Skin doesn't need every step every day — some rest is okay.",
  "Toner preps skin to take in what comes after it more easily.",
  "Centella and rice water are gentle picks for sensitive days.",
  "Ampoules are for the days your skin wants a little extra care.",
  "Removing makeup before bed lets your skin breathe overnight.",
  "Consistency matters more than switching products every week.",
  "Chilled products can feel calming on puffy morning skin.",
  "Silk pillowcases cause less friction than cotton overnight.",
  "Try not to touch your face too often throughout the day.",
  "Body skin deserves the same gentle attention as your face.",
  "Skin needs shift with the seasons, so routines can shift too.",
  "A slower night routine lets each layer settle in properly.",
  "Staying hydrated is good for your whole body, skin included.",
  "Bad skin days don't undo all the good care you've given it.",
  "Your skin is more than something to fix — it's just yours.",
  "A breakout doesn't cancel out how well you're taking care of you.",
  "Skincare can be gentle on your skin and gentle on your mind too.",
  "You're allowed to like your skin exactly as it looks today.",
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's tip, by local calendar day, cycling through the list in order. */
export function tipOfTheDay(now: Date = new Date()): string {
  const localDay = Math.floor((now.getTime() - now.getTimezoneOffset() * 60 * 1000) / DAY_MS);
  return TIPS[((localDay % TIPS.length) + TIPS.length) % TIPS.length];
}
