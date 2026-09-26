import { router } from "expo-router";

import { quizRoutes } from "@/lib/profile";

/**
 * Opens the skin quiz as a modal over whatever screen asked for it (#346):
 * a result's "See your skin match", Home's skin-profile card, Profile, or
 * Search. Finishing or closing it dismisses back to that same screen, so no
 * return address is passed along — a link can set a route param (#29), and
 * closing a modal needs none.
 */
export function openQuiz() {
  router.push(quizRoutes()[0]);
}
