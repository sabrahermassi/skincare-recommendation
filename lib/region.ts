import { getLocales } from "expo-localization";

/**
 * The region set in the phone's settings (iPhone: Settings › General ›
 * Language & Region), as a two-letter code, or `null`. Not the location: it
 * needs no permission and works with Location Services off. Skin needs uses it
 * for the one active sold over the counter in some countries and not others
 * (adapalene, `lib/skin-needs-data.ts`).
 */
export function phoneRegion(): string | null {
  try {
    return getLocales()[0]?.regionCode ?? null;
  } catch {
    return null;
  }
}
