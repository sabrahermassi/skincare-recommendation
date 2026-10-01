import { router } from "expo-router";

/**
 * Back, wherever a screen draws its own back button. A screen opened straight
 * from a link (or as the first thing after a cold start) has nothing under it,
 * and a plain `router.back()` there does nothing at all — the button is dead
 * and the screen has no way out. With nothing to go back to, this goes Home.
 */
export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}
